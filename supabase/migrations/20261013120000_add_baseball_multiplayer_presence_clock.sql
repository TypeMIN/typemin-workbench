alter table public.baseball_games
  add column revision_started_at timestamptz not null default now(),
  add column clock jsonb,
  add constraint baseball_games_clock_object
    check (clock is null or jsonb_typeof(clock) = 'object');

alter table public.baseball_game_seats
  add column visibility text not null default 'visible',
  add constraint baseball_game_seats_visibility_value
    check (visibility in ('visible', 'hidden'));

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
  set status = 'playing', revision_started_at = now(), updated_at = now()
  where id = v_game.id;

  return jsonb_build_object('status', 'joined', 'game_id', v_game.id);
end;
$$;

-- The seven-argument version stays until the previous deployment is gone, so
-- applying this migration never breaks the code that is still live.
create function public.baseball_commit_action(
  p_game_id uuid,
  p_expected_revision bigint,
  p_new_state jsonb,
  p_actor_team text,
  p_action jsonb,
  p_events jsonb,
  p_idempotency_key uuid,
  p_clock jsonb
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
    or jsonb_typeof(p_clock) <> 'object'
    or (p_new_state ->> 'revision')::bigint <> p_expected_revision + 1
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.baseball_games
  set
    state = p_new_state,
    revision = p_expected_revision + 1,
    revision_started_at = now(),
    clock = p_clock,
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

create function public.baseball_update_clock(
  p_game_id uuid,
  p_revision bigint,
  p_expected_clock jsonb,
  p_clock jsonb,
  p_finish boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_clock) <> 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.baseball_games
  set
    clock = p_clock,
    status = case when p_finish then 'finished' else status end,
    updated_at = now()
  where id = p_game_id
    and mode = 'multiplayer'
    and status = 'playing'
    and revision = p_revision
    and clock is not distinct from p_expected_clock;

  if not found then
    return jsonb_build_object('status', 'conflict');
  end if;

  return jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.baseball_commit_action(
  uuid, bigint, jsonb, text, jsonb, jsonb, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.baseball_update_clock(
  uuid, bigint, jsonb, jsonb, boolean
) from public, anon, authenticated;
grant execute on function public.baseball_commit_action(
  uuid, bigint, jsonb, text, jsonb, jsonb, uuid, jsonb
) to service_role;
grant execute on function public.baseball_update_clock(
  uuid, bigint, jsonb, jsonb, boolean
) to service_role;
