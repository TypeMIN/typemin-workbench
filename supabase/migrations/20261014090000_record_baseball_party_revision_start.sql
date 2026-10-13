-- Party devices wait for the shared screen to finish each play, which needs
-- the time a revision was committed. The body is unchanged otherwise.
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
    revision_started_at = now(),
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
