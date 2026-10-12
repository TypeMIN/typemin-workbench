alter table public.baseball_games
  add column reactions jsonb not null default '[]'::jsonb,
  add column series jsonb,
  add constraint baseball_games_reactions_array
    check (jsonb_typeof(reactions) = 'array'),
  add constraint baseball_games_series_object
    check (series is null or jsonb_typeof(series) = 'object');

create function public.baseball_push_reaction(
  p_game_id uuid,
  p_team text,
  p_kind text,
  p_cooldown_ms integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reactions jsonb;
begin
  if p_team not in ('away', 'home')
    or p_kind !~ '^[a-z_]{1,16}$'
    or p_cooldown_ms < 0
    or p_limit < 1
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  select reactions into v_reactions
  from public.baseball_games
  where id = p_game_id
    and mode = 'multiplayer'
    and status in ('playing', 'finished')
  for update;

  if not found then
    return jsonb_build_object('status', 'conflict');
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_reactions) as item(value)
    where item.value ->> 'team' = p_team
      and (item.value ->> 'at')::timestamptz
        > now() - make_interval(secs => p_cooldown_ms / 1000.0)
  ) then
    return jsonb_build_object('status', 'cooldown');
  end if;

  v_reactions := v_reactions || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(),
    'team', p_team,
    'kind', p_kind,
    'at', now()
  ));

  select coalesce(jsonb_agg(recent.value order by recent.idx), '[]'::jsonb)
  into v_reactions
  from (
    select item.value, item.idx
    from jsonb_array_elements(v_reactions) with ordinality as item(value, idx)
    order by item.idx desc
    limit p_limit
  ) as recent;

  update public.baseball_games
  set reactions = v_reactions, updated_at = now()
  where id = p_game_id;

  return jsonb_build_object('status', 'applied');
end;
$$;

create function public.baseball_vote_rematch(
  p_game_id uuid,
  p_revision bigint,
  p_expected_series jsonb,
  p_series jsonb,
  p_new_state jsonb,
  p_clock jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_away public.baseball_game_seats%rowtype;
  v_home public.baseball_game_seats%rowtype;
begin
  if jsonb_typeof(p_series) <> 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;

  if p_new_state is null then
    update public.baseball_games
    set series = p_series, updated_at = now()
    where id = p_game_id
      and mode = 'multiplayer'
      and status = 'finished'
      and revision = p_revision
      and series is not distinct from p_expected_series;
    if not found then
      return jsonb_build_object('status', 'conflict');
    end if;
    return jsonb_build_object('status', 'applied');
  end if;

  if jsonb_typeof(p_new_state) <> 'object'
    or jsonb_typeof(p_clock) <> 'object'
    or (p_new_state ->> 'revision')::bigint <> p_revision + 1
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.baseball_games
  set
    state = p_new_state,
    revision = p_revision + 1,
    status = 'playing',
    clock = p_clock,
    series = p_series,
    revision_started_at = now(),
    expires_at = greatest(expires_at, now() + interval '24 hours'),
    updated_at = now()
  where id = p_game_id
    and mode = 'multiplayer'
    and status = 'finished'
    and revision = p_revision
    and series is not distinct from p_expected_series;

  if not found then
    return jsonb_build_object('status', 'conflict');
  end if;

  select * into v_away from public.baseball_game_seats
  where game_id = p_game_id and team = 'away' for update;
  select * into v_home from public.baseball_game_seats
  where game_id = p_game_id and team = 'home' for update;

  -- Token hashes are unique, so park one seat on a throwaway hash first.
  update public.baseball_game_seats
  set token_hash = md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  where game_id = p_game_id and team = 'away';

  update public.baseball_game_seats
  set token_hash = v_away.token_hash,
      last_seen_at = v_away.last_seen_at,
      visibility = v_away.visibility
  where game_id = p_game_id and team = 'home';

  update public.baseball_game_seats
  set token_hash = v_home.token_hash,
      last_seen_at = v_home.last_seen_at,
      visibility = v_home.visibility
  where game_id = p_game_id and team = 'away';

  return jsonb_build_object('status', 'applied');
end;
$$;

revoke all on function public.baseball_push_reaction(
  uuid, text, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.baseball_vote_rematch(
  uuid, bigint, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.baseball_push_reaction(
  uuid, text, text, integer, integer
) to service_role;
grant execute on function public.baseball_vote_rematch(
  uuid, bigint, jsonb, jsonb, jsonb, jsonb
) to service_role;
