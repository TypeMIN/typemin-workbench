-- Promote the one existing meal account into the shared Workbench identity.
do $$
declare
  existing_account_count bigint;
begin
  select count(*) into existing_account_count
  from public.what_should_eat_users;

  if existing_account_count <> 1 then
    raise exception
      'Expected exactly one existing what_should_eat user, found %',
      existing_account_count;
  end if;
end
$$;

delete from public.what_should_eat_sessions;

alter table public.what_should_eat_users
  rename to workbench_accounts;
alter table public.what_should_eat_sessions
  rename to workbench_sessions;

alter table public.workbench_sessions
  rename column user_id to account_id;

alter table public.workbench_accounts
  add column role text not null default 'member',
  add column must_change_pin boolean not null default false,
  add column failed_login_attempts smallint not null default 0,
  add column locked_until timestamptz,
  add column disabled_at timestamptz,
  add column last_login_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint workbench_accounts_role_value
    check (role in ('member', 'owner')),
  add constraint workbench_accounts_failed_login_attempts_nonnegative
    check (failed_login_attempts >= 0);

update public.workbench_accounts
set role = 'owner', updated_at = now();

create table public.what_should_eat_profiles (
  account_id bigint primary key
    references public.workbench_accounts(id) on delete cascade,
  birth_year smallint not null,
  gender text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint what_should_eat_profiles_birth_year_range
    check (birth_year between 1900 and 2100),
  constraint what_should_eat_profiles_gender_value
    check (gender in ('male', 'female', 'other', 'prefer_not_to_say'))
);

insert into public.what_should_eat_profiles (account_id, birth_year, gender)
select id, birth_year, gender
from public.workbench_accounts;

alter table public.workbench_accounts
  drop column birth_year,
  drop column gender;

create table public.workbench_auth_rate_limits (
  action text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  expires_at timestamptz not null,
  primary key (action, key_hash, window_started_at),
  constraint workbench_auth_rate_limits_action_value
    check (action in ('sign_in', 'sign_up', 'check_id')),
  constraint workbench_auth_rate_limits_request_count_positive
    check (request_count > 0)
);

create index workbench_auth_rate_limits_expires_at_idx
  on public.workbench_auth_rate_limits (expires_at);

create or replace function public.workbench_take_rate_limit(
  p_action text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bucket_start timestamptz;
  next_count integer;
begin
  if p_action not in ('sign_in', 'sign_up', 'check_id')
    or length(p_key_hash) <> 64
    or p_limit < 1
    or p_window_seconds < 1
  then
    raise exception 'invalid rate limit arguments';
  end if;

  bucket_start := date_bin(
    make_interval(secs => p_window_seconds),
    now(),
    timestamptz '2000-01-01 00:00:00+00'
  );

  insert into public.workbench_auth_rate_limits (
    action,
    key_hash,
    window_started_at,
    request_count,
    expires_at
  )
  values (
    p_action,
    p_key_hash,
    bucket_start,
    1,
    bucket_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (action, key_hash, window_started_at)
  do update
  set request_count = public.workbench_auth_rate_limits.request_count + 1
  where public.workbench_auth_rate_limits.request_count < p_limit
  returning request_count into next_count;

  return next_count is not null;
end;
$$;

create or replace function public.workbench_record_login_failure(
  p_account_id bigint
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_locked_until timestamptz;
begin
  update public.workbench_accounts
  set failed_login_attempts = case
        when locked_until is not null and locked_until <= now() then 1
        else failed_login_attempts + 1
      end,
      locked_until = case
        when (
          case
            when locked_until is not null and locked_until <= now() then 1
            else failed_login_attempts + 1
          end
        ) >= 5 then now() + interval '15 minutes'
        else null
      end,
      updated_at = now()
  where id = p_account_id
  returning locked_until into next_locked_until;

  return next_locked_until;
end;
$$;

create or replace function public.workbench_record_login_success(
  p_account_id bigint
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.workbench_accounts
  set failed_login_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      updated_at = now()
  where id = p_account_id;
$$;

alter table public.workbench_accounts enable row level security;
alter table public.workbench_sessions enable row level security;
alter table public.what_should_eat_profiles enable row level security;
alter table public.workbench_auth_rate_limits enable row level security;

alter table public.workbench_accounts force row level security;
alter table public.workbench_sessions force row level security;
alter table public.what_should_eat_profiles force row level security;
alter table public.workbench_auth_rate_limits force row level security;

revoke all on table public.workbench_accounts from public, anon, authenticated;
revoke all on table public.workbench_sessions from public, anon, authenticated;
revoke all on table public.what_should_eat_profiles from public, anon, authenticated;
revoke all on table public.workbench_auth_rate_limits from public, anon, authenticated;

grant select, insert, update, delete
  on table public.workbench_accounts,
    public.workbench_sessions,
    public.what_should_eat_profiles,
    public.workbench_auth_rate_limits
  to service_role;

-- The composite primary key means there is no identity sequence for rate limits.
-- Revoke and grant RPC execution explicitly instead of relying on function defaults.
revoke execute on function public.workbench_take_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.workbench_record_login_failure(bigint)
  from public, anon, authenticated;
revoke execute on function public.workbench_record_login_success(bigint)
  from public, anon, authenticated;

grant execute on function public.workbench_take_rate_limit(text, text, integer, integer),
  public.workbench_record_login_failure(bigint),
  public.workbench_record_login_success(bigint)
  to service_role;

drop policy if exists "server secret only" on public.workbench_accounts;
create policy "server secret only"
  on public.workbench_accounts
  for all
  to anon, authenticated
  using (false)
  with check (false);
drop policy if exists "server secret only" on public.workbench_sessions;
create policy "server secret only"
  on public.workbench_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);
drop policy if exists "server secret only" on public.what_should_eat_profiles;
create policy "server secret only"
  on public.what_should_eat_profiles
  for all
  to anon, authenticated
  using (false)
  with check (false);
drop policy if exists "server secret only" on public.workbench_auth_rate_limits;
create policy "server secret only"
  on public.workbench_auth_rate_limits
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- Archive the completed world cup board without deleting its historical data.
alter table public.worldcup_settings
  alter column admin_pin drop not null,
  add column archived_at timestamptz;

update public.worldcup_settings
set admin_pin = null,
    archived_at = now(),
    api_last_message = '읽기 전용 아카이브';

create or replace function private.prevent_archived_worldcup_writes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.worldcup_settings
    where id = true and archived_at is not null
  ) then
    raise exception 'worldcup project is archived';
  end if;

  return null;
end;
$$;

revoke execute on function private.prevent_archived_worldcup_writes()
  from public, anon, authenticated, service_role;

create trigger worldcup_participants_archive_guard
before insert or update or delete on public.worldcup_participants
for each statement execute function private.prevent_archived_worldcup_writes();

create trigger worldcup_matches_archive_guard
before insert or update or delete on public.worldcup_matches
for each statement execute function private.prevent_archived_worldcup_writes();

create trigger worldcup_predictions_archive_guard
before insert or update or delete on public.worldcup_predictions
for each statement execute function private.prevent_archived_worldcup_writes();

revoke execute on function public.worldcup_join(text, text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_save_prediction(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_admin_state(text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_admin_save_setup(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.worldcup_admin_set_result(text, text, text, text)
  from public, anon, authenticated;

revoke execute on function private.worldcup_join(text, text)
  from anon, authenticated;
revoke execute on function private.worldcup_save_prediction(uuid, text, text, text, text)
  from anon, authenticated;
revoke execute on function private.worldcup_admin_state(text)
  from anon, authenticated;
revoke execute on function private.worldcup_admin_save_setup(text, jsonb, jsonb)
  from anon, authenticated;
revoke execute on function private.worldcup_admin_set_result(text, text, text, text)
  from anon, authenticated;

grant execute on function public.worldcup_public_state(uuid, text) to anon;
grant execute on function private.worldcup_public_state(uuid, text) to anon;
