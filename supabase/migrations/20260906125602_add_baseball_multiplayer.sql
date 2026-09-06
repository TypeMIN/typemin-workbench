create table public.baseball_games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'lobby',
  state jsonb not null,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint baseball_games_room_code_format
    check (room_code ~ '^[A-Z2-9]{6}$'),
  constraint baseball_games_status_value
    check (status in ('lobby', 'playing', 'finished', 'expired')),
  constraint baseball_games_state_object
    check (jsonb_typeof(state) = 'object'),
  constraint baseball_games_revision_nonnegative
    check (revision >= 0)
);

create table public.baseball_game_seats (
  game_id uuid not null
    references public.baseball_games(id) on delete cascade,
  team text not null,
  token_hash text not null unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (game_id, team),
  constraint baseball_game_seats_team_value
    check (team in ('away', 'home')),
  constraint baseball_game_seats_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$')
);

create table public.baseball_game_actions (
  game_id uuid not null
    references public.baseball_games(id) on delete cascade,
  sequence bigint not null,
  actor_team text not null,
  expected_revision bigint not null,
  result_revision bigint not null,
  idempotency_key uuid not null,
  action jsonb not null,
  events jsonb not null,
  created_at timestamptz not null default now(),
  primary key (game_id, sequence),
  unique (game_id, idempotency_key),
  constraint baseball_game_actions_actor_team_value
    check (actor_team in ('away', 'home')),
  constraint baseball_game_actions_revision_step
    check (result_revision = expected_revision + 1),
  constraint baseball_game_actions_json_shapes
    check (jsonb_typeof(action) = 'object' and jsonb_typeof(events) = 'array')
);

create index baseball_games_expires_at_idx
  on public.baseball_games (expires_at);
create index baseball_game_seats_last_seen_idx
  on public.baseball_game_seats (last_seen_at);
create index baseball_game_actions_created_idx
  on public.baseball_game_actions (game_id, created_at desc);

alter table public.baseball_games enable row level security;
alter table public.baseball_game_seats enable row level security;
alter table public.baseball_game_actions enable row level security;
alter table public.baseball_games force row level security;
alter table public.baseball_game_seats force row level security;
alter table public.baseball_game_actions force row level security;

revoke all on table public.baseball_games from public, anon, authenticated;
revoke all on table public.baseball_game_seats from public, anon, authenticated;
revoke all on table public.baseball_game_actions from public, anon, authenticated;

grant select, insert, update, delete
  on table public.baseball_games,
    public.baseball_game_seats,
    public.baseball_game_actions
  to service_role;

create or replace function public.baseball_claim_home_seat(
  p_room_code text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.baseball_games%rowtype;
begin
  select * into v_game
  from public.baseball_games
  where room_code = upper(p_room_code)
    and status = 'lobby'
    and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if exists (
    select 1 from public.baseball_game_seats
    where game_id = v_game.id and team = 'home'
  ) then
    return jsonb_build_object('status', 'occupied');
  end if;

  insert into public.baseball_game_seats (game_id, team, token_hash)
  values (v_game.id, 'home', p_token_hash);

  update public.baseball_games
  set status = 'playing', updated_at = now()
  where id = v_game.id;

  return jsonb_build_object('status', 'joined', 'game_id', v_game.id);
end;
$$;

create or replace function public.baseball_commit_action(
  p_game_id uuid,
  p_expected_revision bigint,
  p_new_state jsonb,
  p_actor_team text,
  p_action jsonb,
  p_events jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result_revision bigint;
  v_existing_revision bigint;
begin
  select result_revision into v_existing_revision
  from public.baseball_game_actions
  where game_id = p_game_id and idempotency_key = p_idempotency_key;

  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'revision', v_existing_revision
    );
  end if;

  if p_actor_team not in ('away', 'home')
    or jsonb_typeof(p_new_state) <> 'object'
    or jsonb_typeof(p_action) <> 'object'
    or jsonb_typeof(p_events) <> 'array'
    or (p_new_state ->> 'revision')::bigint <> p_expected_revision + 1
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.baseball_games
  set
    state = p_new_state,
    revision = p_expected_revision + 1,
    status = case
      when p_new_state ->> 'phase' = 'finished' then 'finished'
      else status
    end,
    updated_at = now()
  where id = p_game_id
    and revision = p_expected_revision
    and status = 'playing'
  returning revision into v_result_revision;

  if not found then
    return jsonb_build_object('status', 'conflict');
  end if;

  insert into public.baseball_game_actions (
    game_id,
    sequence,
    actor_team,
    expected_revision,
    result_revision,
    idempotency_key,
    action,
    events
  ) values (
    p_game_id,
    v_result_revision,
    p_actor_team,
    p_expected_revision,
    v_result_revision,
    p_idempotency_key,
    p_action,
    p_events
  );

  return jsonb_build_object('status', 'applied', 'revision', v_result_revision);
exception
  when unique_violation then
    select result_revision into v_existing_revision
    from public.baseball_game_actions
    where game_id = p_game_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object(
      'status', 'duplicate',
      'revision', v_existing_revision
    );
end;
$$;

revoke all on function public.baseball_claim_home_seat(text, text)
  from public, anon, authenticated;
revoke all on function public.baseball_commit_action(
  uuid, bigint, jsonb, text, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.baseball_claim_home_seat(text, text)
  to service_role;
grant execute on function public.baseball_commit_action(
  uuid, bigint, jsonb, text, jsonb, jsonb, uuid
) to service_role;
