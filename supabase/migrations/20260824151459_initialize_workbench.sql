-- Workbench uses explicit Data API grants. Do not rely on Supabase defaults.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

grant usage on schema public to anon, service_role;

-- what-should-eat: server-secret-only tables. They intentionally start empty.
create table public.what_should_eat_users (
  id bigint generated always as identity primary key,
  login_id text not null unique,
  pin_hash text not null,
  display_name text not null,
  birth_year smallint not null,
  gender text not null,
  created_at timestamptz not null default now(),
  constraint what_should_eat_users_login_id_format
    check (login_id ~ '^[a-z0-9]{3,20}$'),
  constraint what_should_eat_users_display_name_length
    check (char_length(display_name) between 1 and 30),
  constraint what_should_eat_users_birth_year_range
    check (birth_year between 1900 and 2100),
  constraint what_should_eat_users_gender_value
    check (gender in ('male', 'female', 'other', 'prefer_not_to_say'))
);

create table public.what_should_eat_sessions (
  id bigint generated always as identity primary key,
  user_id bigint not null
    references public.what_should_eat_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index what_should_eat_sessions_user_id_idx
  on public.what_should_eat_sessions (user_id);
create index what_should_eat_sessions_expires_at_idx
  on public.what_should_eat_sessions (expires_at);

create table public.what_should_eat_decisions (
  id bigint generated always as identity primary key,
  host_user_id bigint not null
    references public.what_should_eat_users(id) on delete restrict,
  place_id text not null,
  place_name text not null,
  category_name text not null,
  distance_meters integer not null,
  address_name text not null default '',
  road_address_name text not null default '',
  place_url text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  decided_at timestamptz not null default now(),
  constraint what_should_eat_decisions_distance_nonnegative
    check (distance_meters >= 0)
);

create index what_should_eat_decisions_host_user_id_idx
  on public.what_should_eat_decisions (host_user_id);
create index what_should_eat_decisions_decided_at_idx
  on public.what_should_eat_decisions (decided_at desc);
create index what_should_eat_decisions_place_recent_idx
  on public.what_should_eat_decisions (place_id, decided_at desc);

create table public.what_should_eat_decision_participants (
  decision_id bigint not null
    references public.what_should_eat_decisions(id) on delete cascade,
  user_id bigint not null
    references public.what_should_eat_users(id) on delete restrict,
  primary key (decision_id, user_id)
);

create index what_should_eat_decision_participants_user_decision_idx
  on public.what_should_eat_decision_participants (user_id, decision_id);

create table public.what_should_eat_place_feedback (
  id bigint generated always as identity primary key,
  user_id bigint not null
    references public.what_should_eat_users(id) on delete cascade,
  decision_id bigint
    references public.what_should_eat_decisions(id) on delete cascade,
  place_id text not null,
  place_name text not null,
  category_name text not null,
  address_name text not null default '',
  road_address_name text not null default '',
  place_url text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  response text not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint what_should_eat_place_feedback_response_value
    check (response in ('liked', 'disliked', 'not_visited')),
  constraint what_should_eat_place_feedback_source_value
    check (source in ('decision', 'manual')),
  constraint what_should_eat_place_feedback_source_context
    check (
      (source = 'decision' and decision_id is not null)
      or
      (source = 'manual' and decision_id is null and response <> 'not_visited')
    )
);

create unique index what_should_eat_place_feedback_decision_user_uidx
  on public.what_should_eat_place_feedback (decision_id, user_id)
  where decision_id is not null;
create unique index what_should_eat_place_feedback_manual_user_place_uidx
  on public.what_should_eat_place_feedback (user_id, place_id)
  where source = 'manual';
create index what_should_eat_place_feedback_user_updated_idx
  on public.what_should_eat_place_feedback (user_id, updated_at desc);
create index what_should_eat_place_feedback_place_response_idx
  on public.what_should_eat_place_feedback (place_id, response);
create index what_should_eat_place_feedback_category_response_idx
  on public.what_should_eat_place_feedback (category_name, response);

create table public.what_should_eat_comparisons (
  id bigint generated always as identity primary key,
  decision_id bigint not null
    references public.what_should_eat_decisions(id) on delete cascade,
  host_user_id bigint not null
    references public.what_should_eat_users(id) on delete cascade,
  round smallint not null,
  winner_place_id text not null,
  winner_category_name text not null,
  loser_place_id text not null,
  loser_category_name text not null,
  created_at timestamptz not null default now(),
  constraint what_should_eat_comparisons_round_positive check (round > 0),
  constraint what_should_eat_comparisons_distinct_places
    check (winner_place_id <> loser_place_id),
  constraint what_should_eat_comparisons_decision_round_unique
    unique (decision_id, round)
);

create index what_should_eat_comparisons_host_created_idx
  on public.what_should_eat_comparisons (host_user_id, created_at desc);

-- worldcup-prediction: all state changes go through PIN-validating RPCs.
create table public.worldcup_settings (
  id boolean primary key default true check (id),
  admin_pin text not null default '0000' check (admin_pin ~ '^\d{4}$'),
  api_last_sync timestamptz,
  api_last_message text not null default ''
);

create table public.worldcup_participants (
  id uuid primary key default gen_random_uuid(),
  slot smallint not null unique check (slot between 1 and 5),
  name text not null,
  pin text,
  registered boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint worldcup_participants_pin_shape
    check (pin is null or pin ~ '^\d{4}$'),
  constraint worldcup_participants_registration_context
    check ((registered and pin is not null) or (not registered and pin is null))
);

create unique index worldcup_participants_registered_name_uidx
  on public.worldcup_participants (lower(name))
  where registered;

create table public.worldcup_matches (
  id text primary key,
  stage text not null
    check (stage in ('r32', 'r16', 'qf', 'sf', 'third', 'final')),
  label text not null,
  team_a text not null,
  team_b text not null,
  team_a_crest text,
  team_b_crest text,
  kickoff timestamptz,
  external_id text unique,
  synced_pre boolean not null default false,
  result_team text check (result_team in ('A', 'B')),
  result_regular text check (result_regular in ('win', 'draw')),
  result_home smallint check (result_home >= 0),
  result_away smallint check (result_away >= 0),
  result_pen_home smallint check (result_pen_home >= 0),
  result_pen_away smallint check (result_pen_away >= 0),
  result_duration text,
  updated_at timestamptz not null default now(),
  constraint worldcup_matches_result_context check (
    (result_team is null and result_regular is null)
    or
    (result_team is not null and result_regular is not null)
  )
);

create index worldcup_matches_stage_idx on public.worldcup_matches (stage);

create table public.worldcup_predictions (
  participant_id uuid not null
    references public.worldcup_participants(id) on delete cascade,
  match_id text not null
    references public.worldcup_matches(id) on delete cascade,
  team text not null check (team in ('A', 'B')),
  regular text not null check (regular in ('win', 'draw')),
  updated_at timestamptz not null default now(),
  primary key (participant_id, match_id)
);

create index worldcup_predictions_match_id_idx
  on public.worldcup_predictions (match_id);

create table public.worldcup_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table public.what_should_eat_users enable row level security;
alter table public.what_should_eat_sessions enable row level security;
alter table public.what_should_eat_decisions enable row level security;
alter table public.what_should_eat_decision_participants enable row level security;
alter table public.what_should_eat_place_feedback enable row level security;
alter table public.what_should_eat_comparisons enable row level security;
alter table public.worldcup_settings enable row level security;
alter table public.worldcup_participants enable row level security;
alter table public.worldcup_matches enable row level security;
alter table public.worldcup_predictions enable row level security;
alter table public.worldcup_events enable row level security;

alter table public.what_should_eat_users force row level security;
alter table public.what_should_eat_sessions force row level security;
alter table public.what_should_eat_decisions force row level security;
alter table public.what_should_eat_decision_participants force row level security;
alter table public.what_should_eat_place_feedback force row level security;
alter table public.what_should_eat_comparisons force row level security;
alter table public.worldcup_settings force row level security;
alter table public.worldcup_participants force row level security;
alter table public.worldcup_matches force row level security;
alter table public.worldcup_predictions force row level security;
alter table public.worldcup_events force row level security;

revoke all on table public.what_should_eat_users from public, anon, authenticated;
revoke all on table public.what_should_eat_sessions from public, anon, authenticated;
revoke all on table public.what_should_eat_decisions from public, anon, authenticated;
revoke all on table public.what_should_eat_decision_participants from public, anon, authenticated;
revoke all on table public.what_should_eat_place_feedback from public, anon, authenticated;
revoke all on table public.what_should_eat_comparisons from public, anon, authenticated;
revoke all on table public.worldcup_settings from public, anon, authenticated;
revoke all on table public.worldcup_participants from public, anon, authenticated;
revoke all on table public.worldcup_matches from public, anon, authenticated;
revoke all on table public.worldcup_predictions from public, anon, authenticated;
revoke all on table public.worldcup_events from public, anon, authenticated;

grant select, insert, update, delete
  on table public.what_should_eat_users,
    public.what_should_eat_sessions,
    public.what_should_eat_decisions,
    public.what_should_eat_decision_participants,
    public.what_should_eat_place_feedback,
    public.what_should_eat_comparisons,
    public.worldcup_settings,
    public.worldcup_participants,
    public.worldcup_matches,
    public.worldcup_predictions,
    public.worldcup_events
  to service_role;

grant usage, select
  on sequence public.what_should_eat_users_id_seq,
    public.what_should_eat_sessions_id_seq,
    public.what_should_eat_decisions_id_seq,
    public.what_should_eat_place_feedback_id_seq,
    public.what_should_eat_comparisons_id_seq,
    public.worldcup_events_id_seq
  to service_role;

create policy "anonymous clients can receive refresh events"
  on public.worldcup_events
  for select
  to anon
  using (true);

grant select on table public.worldcup_events to anon;

do $$
begin
  alter publication supabase_realtime add table public.worldcup_events;
exception
  when duplicate_object then null;
end
$$;

insert into public.worldcup_settings (id, admin_pin)
values (true, '0000');

insert into public.worldcup_participants (slot, name, registered)
select slot, '빈 자리 ' || slot, false
from generate_series(1, 5) as seeded(slot);

insert into public.worldcup_matches (id, stage, label, team_a, team_b)
select
  case
    when stage in ('third', 'final') then stage
    when stage in ('qf', 'sf') then stage || game
    else stage || '_' || game
  end,
  stage,
  case
    when stage = 'third' then '3·4위전'
    when stage = 'final' then '결승'
    else stage_label || ' ' || game || '경기'
  end,
  '팀 ' || (game * 2 - 1),
  '팀 ' || (game * 2)
from (
  select 'r32' stage, '32강' stage_label, generate_series(1, 16) game
  union all select 'r16', '16강', generate_series(1, 8)
  union all select 'qf', '8강', generate_series(1, 4)
  union all select 'sf', '4강', generate_series(1, 2)
  union all select 'third', '3·4위전', 1
  union all select 'final', '결승', 1
) as seeded;

create or replace function public.worldcup_touch()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.worldcup_events default values;
$$;

create or replace function public.worldcup_is_admin(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.worldcup_settings
    where id = true and admin_pin = p_pin
  );
$$;

create or replace function public.worldcup_join(p_name text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.worldcup_participants%rowtype;
begin
  if length(trim(p_name)) = 0 or p_pin !~ '^\d{4}$' then
    return jsonb_build_object('reason', 'invalid');
  end if;

  if lower(trim(p_name)) in ('관리자', 'admin')
    and public.worldcup_is_admin(p_pin)
  then
    return jsonb_build_object('role', 'admin');
  end if;

  select *
  into existing
  from public.worldcup_participants
  where registered and lower(name) = lower(trim(p_name))
  limit 1;

  if found then
    if existing.pin <> p_pin then
      return jsonb_build_object('reason', 'pin');
    end if;
    return jsonb_build_object(
      'role', 'participant',
      'slot', existing.slot,
      'participantId', existing.id,
      'name', existing.name
    );
  end if;

  select *
  into existing
  from public.worldcup_participants
  where not registered
  order by slot
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('reason', 'full');
  end if;

  update public.worldcup_participants
  set name = trim(p_name),
      pin = p_pin,
      registered = true,
      updated_at = now()
  where id = existing.id
  returning * into existing;

  perform public.worldcup_touch();
  return jsonb_build_object(
    'role', 'participant',
    'slot', existing.slot,
    'participantId', existing.id,
    'name', existing.name
  );
end;
$$;

create or replace function public.worldcup_public_state(
  p_participant_id uuid default null,
  p_pin text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_valid boolean := false;
begin
  if p_participant_id is not null and p_pin is not null then
    select exists (
      select 1
      from public.worldcup_participants
      where id = p_participant_id
        and registered
        and pin = p_pin
    ) into viewer_valid;
  end if;

  return jsonb_build_object(
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'slot', slot,
        'name', name,
        'registered', registered
      ) order by slot)
      from public.worldcup_participants
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'stage', stage,
        'label', label,
        'teamA', team_a,
        'teamB', team_b,
        'crestA', coalesce(team_a_crest, ''),
        'crestB', coalesce(team_b_crest, ''),
        'externalId', coalesce(external_id, ''),
        'kickoff', coalesce(
          to_char(kickoff at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          ''
        ),
        'result', case
          when result_team is null then null
          else jsonb_build_object(
            'team', result_team,
            'regular', result_regular,
            'home', result_home,
            'away', result_away,
            'penHome', result_pen_home,
            'penAway', result_pen_away,
            'duration', result_duration
          )
        end
      ) order by
        case stage
          when 'r32' then 1
          when 'r16' then 2
          when 'qf' then 3
          when 'sf' then 4
          when 'third' then 5
          else 6
        end,
        id
      )
      from public.worldcup_matches
    ), '[]'::jsonb),
    'predictions', coalesce((
      select jsonb_object_agg(slot::text, picks)
      from (
        select p.slot,
          jsonb_object_agg(pr.match_id, jsonb_build_object(
            'team', pr.team,
            'regular', pr.regular
          )) as picks
        from public.worldcup_predictions as pr
        join public.worldcup_participants as p
          on p.id = pr.participant_id
        join public.worldcup_matches as m
          on m.id = pr.match_id
        where p.registered
          and (
            m.result_team is not null
            or (viewer_valid and p.id = p_participant_id)
          )
        group by p.slot
      ) as visible
    ), '{}'::jsonb),
    'api', coalesce((
      select jsonb_build_object(
        'lastSync', coalesce(
          to_char(api_last_sync at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          ''
        ),
        'lastMessage', api_last_message
      )
      from public.worldcup_settings
      where id = true
    ), jsonb_build_object('lastSync', '', 'lastMessage', ''))
  );
end;
$$;

create or replace function public.worldcup_admin_state(p_admin_pin text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
begin
  if not public.worldcup_is_admin(p_admin_pin) then
    raise exception 'invalid admin pin';
  end if;

  base := public.worldcup_public_state(null, null);
  return jsonb_set(base, '{predictions}', coalesce((
    select jsonb_object_agg(slot::text, picks)
    from (
      select p.slot,
        jsonb_object_agg(pr.match_id, jsonb_build_object(
          'team', pr.team,
          'regular', pr.regular
        )) as picks
      from public.worldcup_predictions as pr
      join public.worldcup_participants as p
        on p.id = pr.participant_id
      where p.registered
      group by p.slot
    ) as all_picks
  ), '{}'::jsonb));
end;
$$;

create or replace function public.worldcup_save_prediction(
  p_participant_id uuid,
  p_pin text,
  p_match_id text,
  p_team text,
  p_regular text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.worldcup_matches%rowtype;
  feeder text;
begin
  if not exists (
    select 1
    from public.worldcup_participants
    where id = p_participant_id
      and registered
      and pin = p_pin
  ) then
    raise exception 'invalid participant';
  end if;

  select *
  into target
  from public.worldcup_matches
  where id = p_match_id;

  if not found then
    raise exception 'unknown match';
  end if;

  feeder := case target.stage
    when 'r16' then 'r32'
    when 'qf' then 'r16'
    when 'sf' then 'qf'
    when 'third' then 'sf'
    when 'final' then 'sf'
    else null
  end;

  if feeder is not null and exists (
    select 1
    from public.worldcup_matches
    where stage = feeder and result_team is null
  ) then
    raise exception 'round is not open';
  end if;

  if exists (
    select 1
    from public.worldcup_matches
    where stage = target.stage
      and (
        result_team is not null
        or (kickoff is not null and kickoff <= now())
      )
  ) then
    raise exception 'prediction is locked';
  end if;

  if p_team is null or p_regular is null then
    delete from public.worldcup_predictions
    where participant_id = p_participant_id and match_id = p_match_id;
  else
    if p_team not in ('A', 'B') or p_regular not in ('win', 'draw') then
      raise exception 'invalid prediction';
    end if;

    insert into public.worldcup_predictions (
      participant_id,
      match_id,
      team,
      regular
    )
    values (p_participant_id, p_match_id, p_team, p_regular)
    on conflict (participant_id, match_id)
    do update set
      team = excluded.team,
      regular = excluded.regular,
      updated_at = now();
  end if;

  perform public.worldcup_touch();
  return public.worldcup_public_state(p_participant_id, p_pin);
end;
$$;

create or replace function public.worldcup_admin_save_setup(
  p_admin_pin text,
  p_participants jsonb,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  target_participant_id uuid;
  keep_registered boolean;
begin
  if not public.worldcup_is_admin(p_admin_pin) then
    raise exception 'invalid admin pin';
  end if;

  for item in
    select * from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
  loop
    keep_registered := coalesce((item->>'registered')::boolean, false);
    update public.worldcup_participants
    set name = coalesce(nullif(trim(item->>'name'), ''), name),
        registered = keep_registered,
        pin = case when keep_registered then pin else null end,
        updated_at = now()
    where slot = (item->>'slot')::smallint
    returning id into target_participant_id;

    if target_participant_id is not null and not keep_registered then
      delete from public.worldcup_predictions
      where worldcup_predictions.participant_id = target_participant_id;
    end if;
  end loop;

  for item in
    select * from jsonb_array_elements(coalesce(p_matches, '[]'::jsonb))
  loop
    update public.worldcup_matches
    set team_a = coalesce(nullif(trim(item->>'teamA'), ''), team_a),
        team_b = coalesce(nullif(trim(item->>'teamB'), ''), team_b),
        kickoff = nullif(item->>'kickoff', '')::timestamptz,
        external_id = coalesce(nullif(item->>'externalId', ''), external_id),
        updated_at = now()
    where id = item->>'id';
  end loop;

  perform public.worldcup_touch();
  return public.worldcup_admin_state(p_admin_pin);
end;
$$;

create or replace function public.worldcup_admin_set_result(
  p_admin_pin text,
  p_match_id text,
  p_team text,
  p_regular text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.worldcup_is_admin(p_admin_pin) then
    raise exception 'invalid admin pin';
  end if;

  if p_team is not null
    and (p_team not in ('A', 'B') or p_regular not in ('win', 'draw'))
  then
    raise exception 'invalid result';
  end if;

  update public.worldcup_matches
  set result_team = p_team,
      result_regular = p_regular,
      result_home = case when p_team is null then null else result_home end,
      result_away = case when p_team is null then null else result_away end,
      result_pen_home = case when p_team is null then null else result_pen_home end,
      result_pen_away = case when p_team is null then null else result_pen_away end,
      result_duration = case when p_team is null then null else result_duration end,
      updated_at = now()
  where id = p_match_id;

  if not found then
    raise exception 'unknown match';
  end if;

  perform public.worldcup_touch();
  return public.worldcup_admin_state(p_admin_pin);
end;
$$;

revoke execute on function public.worldcup_touch()
  from public, anon, authenticated;
revoke execute on function public.worldcup_is_admin(text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_join(text, text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_public_state(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_admin_state(text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_save_prediction(uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.worldcup_admin_save_setup(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke execute on function public.worldcup_admin_set_result(text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.worldcup_join(text, text) to anon;
grant execute on function public.worldcup_public_state(uuid, text) to anon;
grant execute on function public.worldcup_admin_state(text) to anon;
grant execute on function public.worldcup_save_prediction(uuid, text, text, text, text)
  to anon;
grant execute on function public.worldcup_admin_save_setup(text, jsonb, jsonb)
  to anon;
grant execute on function public.worldcup_admin_set_result(text, text, text, text)
  to anon;

grant execute on function public.worldcup_touch(),
  public.worldcup_is_admin(text),
  public.worldcup_join(text, text),
  public.worldcup_public_state(uuid, text),
  public.worldcup_admin_state(text),
  public.worldcup_save_prediction(uuid, text, text, text, text),
  public.worldcup_admin_save_setup(text, jsonb, jsonb),
  public.worldcup_admin_set_result(text, text, text, text)
  to service_role;
