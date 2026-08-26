alter table public.worldcup_participants
  add column login_enabled boolean;

update public.worldcup_participants
set login_enabled = registered;

alter table public.worldcup_participants
  alter column login_enabled set default false,
  alter column login_enabled set not null;

alter table public.worldcup_participants
  drop constraint worldcup_participants_registration_context;

alter table public.worldcup_participants
  add constraint worldcup_participants_registration_context check (
    (
      registered
      and (
        (login_enabled and pin is not null)
        or (not login_enabled and pin is null)
      )
    )
    or (not registered and not login_enabled and pin is null)
  );

create or replace function private.worldcup_join(p_name text, p_pin text)
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
    and private.worldcup_is_admin(p_pin)
  then
    return jsonb_build_object('role', 'admin');
  end if;

  select *
  into existing
  from public.worldcup_participants
  where registered and lower(name) = lower(trim(p_name))
  limit 1;

  if found then
    if not existing.login_enabled then
      return jsonb_build_object('reason', 'historical');
    end if;
    if existing.pin is distinct from p_pin then
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
      login_enabled = true,
      updated_at = now()
  where id = existing.id
  returning * into existing;

  perform private.worldcup_touch();
  return jsonb_build_object(
    'role', 'participant',
    'slot', existing.slot,
    'participantId', existing.id,
    'name', existing.name
  );
end;
$$;

create or replace function private.worldcup_save_prediction(
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
      and login_enabled
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

  perform private.worldcup_touch();
  return private.worldcup_public_state(p_participant_id, p_pin);
end;
$$;

create or replace function private.worldcup_admin_save_setup(
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
  if not private.worldcup_is_admin(p_admin_pin) then
    raise exception 'invalid admin pin';
  end if;

  for item in
    select * from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb))
  loop
    keep_registered := coalesce((item->>'registered')::boolean, false);
    target_participant_id := null;

    update public.worldcup_participants
    set name = coalesce(nullif(trim(item->>'name'), ''), name),
        registered = keep_registered,
        login_enabled = case
          when keep_registered then login_enabled
          else false
        end,
        pin = case
          when keep_registered and login_enabled then pin
          else null
        end,
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

  perform private.worldcup_touch();
  return private.worldcup_admin_state(p_admin_pin);
end;
$$;

create function private.worldcup_apply_football_sync(
  p_matches jsonb,
  p_synced_at timestamptz,
  p_message text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer := 0;
begin
  if jsonb_typeof(p_matches) <> 'array' then
    raise exception 'matches must be a JSON array';
  end if;

  if jsonb_array_length(p_matches) > 32 then
    raise exception 'too many matches';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_matches) as item(id text)
    where item.id is null
       or not exists (
         select 1 from public.worldcup_matches where worldcup_matches.id = item.id
       )
  ) then
    raise exception 'unknown match id';
  end if;

  if exists (
    select item.external_id
    from jsonb_to_recordset(p_matches) as item(external_id text)
    group by item.external_id
    having item.external_id is null or count(*) > 1
  ) then
    raise exception 'invalid or duplicate external id';
  end if;

  update public.worldcup_matches as target
  set external_id = incoming.external_id,
      team_a = incoming.team_a,
      team_b = incoming.team_b,
      team_a_crest = incoming.team_a_crest,
      team_b_crest = incoming.team_b_crest,
      kickoff = incoming.kickoff,
      synced_pre = incoming.synced_pre,
      result_team = case
        when incoming.apply_result then incoming.result_team
        else target.result_team
      end,
      result_regular = case
        when incoming.apply_result then incoming.result_regular
        else target.result_regular
      end,
      result_home = case
        when incoming.apply_result then incoming.result_home
        else target.result_home
      end,
      result_away = case
        when incoming.apply_result then incoming.result_away
        else target.result_away
      end,
      result_pen_home = case
        when incoming.apply_result then incoming.result_pen_home
        else target.result_pen_home
      end,
      result_pen_away = case
        when incoming.apply_result then incoming.result_pen_away
        else target.result_pen_away
      end,
      result_duration = case
        when incoming.apply_result then incoming.result_duration
        else target.result_duration
      end,
      updated_at = p_synced_at
  from jsonb_to_recordset(p_matches) as incoming(
    id text,
    external_id text,
    team_a text,
    team_b text,
    team_a_crest text,
    team_b_crest text,
    kickoff timestamptz,
    synced_pre boolean,
    apply_result boolean,
    result_team text,
    result_regular text,
    result_home smallint,
    result_away smallint,
    result_pen_home smallint,
    result_pen_away smallint,
    result_duration text
  )
  where target.id = incoming.id;

  get diagnostics updated_count = row_count;

  update public.worldcup_settings
  set api_last_sync = p_synced_at,
      api_last_message = p_message
  where id = true;

  if updated_count > 0 then
    perform private.worldcup_touch();
  end if;

  return updated_count;
end;
$$;

create function public.worldcup_apply_football_sync(
  p_matches jsonb,
  p_synced_at timestamptz,
  p_message text
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.worldcup_apply_football_sync(
    p_matches,
    p_synced_at,
    p_message
  );
$$;

revoke execute on function private.worldcup_apply_football_sync(
  jsonb,
  timestamptz,
  text
) from public, anon, authenticated;
revoke execute on function public.worldcup_apply_football_sync(
  jsonb,
  timestamptz,
  text
) from public, anon, authenticated;

grant execute on function private.worldcup_apply_football_sync(
  jsonb,
  timestamptz,
  text
) to service_role;
grant execute on function public.worldcup_apply_football_sync(
  jsonb,
  timestamptz,
  text
) to service_role;
