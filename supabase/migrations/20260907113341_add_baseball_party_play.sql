alter table public.baseball_games
  add column mode text not null default 'multiplayer',
  add column host_token_hash text,
  add column room_revision bigint not null default 0,
  add column party_state jsonb;

alter table public.baseball_games
  drop constraint baseball_games_status_value,
  add constraint baseball_games_status_value
    check (status in ('lobby', 'playing', 'paused', 'finished', 'expired')),
  add constraint baseball_games_mode_value
    check (mode in ('multiplayer', 'party')),
  add constraint baseball_games_room_revision_nonnegative
    check (room_revision >= 0),
  add constraint baseball_games_party_shape
    check (
      (mode = 'multiplayer' and host_token_hash is null and party_state is null)
      or
      (mode = 'party'
        and host_token_hash ~ '^[0-9a-f]{64}$'
        and jsonb_typeof(party_state) = 'object')
    );

create table public.baseball_party_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.baseball_games(id) on delete cascade,
  team text not null,
  nickname text not null,
  token_hash text not null unique,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint baseball_party_players_team_value check (team in ('away', 'home')),
  constraint baseball_party_players_nickname_length
    check (char_length(btrim(nickname)) between 1 and 12),
  constraint baseball_party_players_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$')
);

create unique index baseball_party_players_active_nickname_idx
  on public.baseball_party_players (game_id, lower(nickname))
  where removed_at is null;
create index baseball_party_players_roster_idx
  on public.baseball_party_players (game_id, team, joined_at)
  where removed_at is null;
create index baseball_party_players_presence_idx
  on public.baseball_party_players (game_id, last_seen_at)
  where removed_at is null;

create table public.baseball_party_events (
  game_id uuid not null references public.baseball_games(id) on delete cascade,
  sequence bigint not null,
  event_type text not null,
  actor_player_id uuid references public.baseball_party_players(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, sequence),
  constraint baseball_party_events_payload_object check (jsonb_typeof(payload) = 'object')
);

alter table public.baseball_game_actions
  add column actor_player_id uuid references public.baseball_party_players(id) on delete set null,
  add column room_revision bigint;

alter table public.baseball_party_players enable row level security;
alter table public.baseball_party_events enable row level security;
alter table public.baseball_party_players force row level security;
alter table public.baseball_party_events force row level security;

revoke all on table public.baseball_party_players, public.baseball_party_events
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.baseball_party_players, public.baseball_party_events
  to service_role;

create policy "baseball party players are server only"
  on public.baseball_party_players for all to anon, authenticated
  using (false) with check (false);
create policy "baseball party events are server only"
  on public.baseball_party_events for all to anon, authenticated
  using (false) with check (false);

create or replace function public.baseball_party_join(
  p_room_code text,
  p_nickname text,
  p_team text,
  p_token_hash text,
  p_expected_room_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.baseball_games%rowtype;
  v_player_id uuid;
  v_room_revision bigint;
begin
  select * into v_game from public.baseball_games
  where room_code = upper(p_room_code)
    and mode = 'party'
    and status = 'lobby'
    and expires_at > now()
  for update;

  if not found or v_game.room_revision <> p_expected_room_revision then
    return jsonb_build_object('status', 'conflict');
  end if;
  if p_team not in ('away', 'home')
    or char_length(btrim(p_nickname)) not between 1 and 12
    or p_token_hash !~ '^[0-9a-f]{64}$'
  then
    return jsonb_build_object('status', 'invalid');
  end if;
  if exists (
    select 1 from public.baseball_party_players
    where game_id = v_game.id and removed_at is null
      and lower(nickname) = lower(btrim(p_nickname))
  ) then
    return jsonb_build_object('status', 'nickname_taken');
  end if;
  if (
    select count(*) from public.baseball_party_players
    where game_id = v_game.id and team = p_team and removed_at is null
  ) >= 8 then
    return jsonb_build_object('status', 'team_full');
  end if;

  insert into public.baseball_party_players (game_id, team, nickname, token_hash)
  values (v_game.id, p_team, btrim(p_nickname), p_token_hash)
  returning id into v_player_id;

  update public.baseball_games
  set room_revision = room_revision + 1, updated_at = now()
  where id = v_game.id returning room_revision into v_room_revision;

  insert into public.baseball_party_events (game_id, sequence, event_type, actor_player_id, payload)
  values (
    v_game.id,
    v_room_revision,
    'player_joined',
    v_player_id,
    jsonb_build_object('team', p_team, 'nickname', btrim(p_nickname))
  );
  return jsonb_build_object(
    'status', 'joined',
    'player_id', v_player_id,
    'room_revision', v_room_revision
  );
exception when unique_violation then
  return jsonb_build_object('status', 'conflict');
end;
$$;

create or replace function public.baseball_party_heartbeat(
  p_game_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update public.baseball_party_players
  set last_seen_at = now()
  where game_id = p_game_id and id = p_player_id and removed_at is null
  returning true
$$;

create or replace function public.baseball_party_host_mutation(
  p_game_id uuid,
  p_expected_room_revision bigint,
  p_status text,
  p_state jsonb,
  p_party_state jsonb,
  p_event_type text,
  p_player_operation jsonb,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.baseball_games%rowtype;
  v_player public.baseball_party_players%rowtype;
  v_target_team text;
  v_room_revision bigint;
begin
  select * into v_game from public.baseball_games
  where id = p_game_id and mode = 'party' for update;
  if not found or v_game.room_revision <> p_expected_room_revision then
    return jsonb_build_object('status', 'conflict');
  end if;
  if p_status not in ('lobby', 'playing', 'paused', 'finished', 'expired')
    or jsonb_typeof(p_state) <> 'object'
    or jsonb_typeof(p_party_state) <> 'object'
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_player_operation is not null then
    select * into v_player from public.baseball_party_players
    where id = (p_player_operation ->> 'playerId')::uuid
      and game_id = p_game_id and removed_at is null
    for update;
    if not found then return jsonb_build_object('status', 'invalid'); end if;

    if p_player_operation ->> 'type' = 'move' then
      v_target_team := p_player_operation ->> 'team';
      if v_game.status <> 'lobby' or v_target_team not in ('away', 'home') then
        return jsonb_build_object('status', 'invalid');
      end if;
      if (
        select count(*) from public.baseball_party_players
        where game_id = p_game_id and team = v_target_team and removed_at is null
      ) >= 8 then return jsonb_build_object('status', 'invalid'); end if;
      update public.baseball_party_players set team = v_target_team where id = v_player.id;
    elsif p_player_operation ->> 'type' = 'remove' then
      update public.baseball_party_players set removed_at = now() where id = v_player.id;
    else
      return jsonb_build_object('status', 'invalid');
    end if;
  end if;

  update public.baseball_games set
    status = p_status,
    state = p_state,
    revision = (p_state ->> 'revision')::bigint,
    party_state = p_party_state,
    room_revision = room_revision + 1,
    updated_at = now()
  where id = p_game_id returning room_revision into v_room_revision;

  insert into public.baseball_party_events (game_id, sequence, event_type, payload)
  values (p_game_id, v_room_revision, p_event_type, coalesce(p_payload, '{}'::jsonb));
  return jsonb_build_object(
    'status', 'applied',
    'revision', (p_state ->> 'revision')::bigint,
    'room_revision', v_room_revision
  );
exception when invalid_text_representation or check_violation or unique_violation then
  return jsonb_build_object('status', 'invalid');
end;
$$;

create or replace function public.baseball_party_commit_action(
  p_game_id uuid,
  p_expected_revision bigint,
  p_expected_room_revision bigint,
  p_new_state jsonb,
  p_party_state jsonb,
  p_actor_team text,
  p_actor_player_id uuid,
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
  v_existing public.baseball_game_actions%rowtype;
  v_room_revision bigint;
begin
  select * into v_existing from public.baseball_game_actions
  where game_id = p_game_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'revision', v_existing.result_revision,
      'room_revision', v_existing.room_revision
    );
  end if;
  if p_actor_team not in ('away', 'home')
    or jsonb_typeof(p_new_state) <> 'object'
    or jsonb_typeof(p_party_state) <> 'object'
    or jsonb_typeof(p_action) <> 'object'
    or jsonb_typeof(p_events) <> 'array'
    or (p_new_state ->> 'revision')::bigint <> p_expected_revision + 1
    or not exists (
      select 1 from public.baseball_party_players
      where id = p_actor_player_id and game_id = p_game_id
        and team = p_actor_team and removed_at is null
    )
  then return jsonb_build_object('status', 'invalid'); end if;

  update public.baseball_games set
    state = p_new_state,
    revision = p_expected_revision + 1,
    room_revision = room_revision + 1,
    party_state = p_party_state,
    status = case when p_new_state ->> 'phase' = 'finished' then 'finished' else status end,
    updated_at = now()
  where id = p_game_id and mode = 'party' and status = 'playing'
    and revision = p_expected_revision and room_revision = p_expected_room_revision
  returning room_revision into v_room_revision;
  if not found then return jsonb_build_object('status', 'conflict'); end if;

  insert into public.baseball_game_actions (
    game_id, sequence, actor_team, actor_player_id, expected_revision,
    result_revision, room_revision, idempotency_key, action, events
  ) values (
    p_game_id, p_expected_revision + 1, p_actor_team, p_actor_player_id,
    p_expected_revision, p_expected_revision + 1, v_room_revision,
    p_idempotency_key, p_action, p_events
  );
  return jsonb_build_object(
    'status', 'applied',
    'revision', p_expected_revision + 1,
    'room_revision', v_room_revision
  );
exception when unique_violation then
  select * into v_existing from public.baseball_game_actions
  where game_id = p_game_id and idempotency_key = p_idempotency_key;
  return jsonb_build_object(
    'status', 'duplicate',
    'revision', v_existing.result_revision,
    'room_revision', v_existing.room_revision
  );
end;
$$;

revoke all on function public.baseball_party_join(text, text, text, text, bigint)
  from public, anon, authenticated;
revoke all on function public.baseball_party_heartbeat(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.baseball_party_host_mutation(uuid, bigint, text, jsonb, jsonb, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.baseball_party_commit_action(uuid, bigint, bigint, jsonb, jsonb, text, uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.baseball_party_join(text, text, text, text, bigint)
  to service_role;
grant execute on function public.baseball_party_heartbeat(uuid, uuid)
  to service_role;
grant execute on function public.baseball_party_host_mutation(uuid, bigint, text, jsonb, jsonb, text, jsonb, jsonb)
  to service_role;
grant execute on function public.baseball_party_commit_action(uuid, bigint, bigint, jsonb, jsonb, text, uuid, jsonb, jsonb, uuid)
  to service_role;
