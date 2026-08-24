create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to anon, service_role;

alter function public.worldcup_touch() set schema private;
alter function public.worldcup_is_admin(text) set schema private;
alter function public.worldcup_join(text, text) set schema private;
alter function public.worldcup_public_state(uuid, text) set schema private;
alter function public.worldcup_admin_state(text) set schema private;
alter function public.worldcup_save_prediction(uuid, text, text, text, text)
  set schema private;
alter function public.worldcup_admin_save_setup(text, jsonb, jsonb)
  set schema private;
alter function public.worldcup_admin_set_result(text, text, text, text)
  set schema private;

revoke execute on function private.worldcup_touch()
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_is_admin(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_join(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_public_state(uuid, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_admin_state(text)
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_save_prediction(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_admin_save_setup(text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function private.worldcup_admin_set_result(text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function private.worldcup_join(text, text),
  private.worldcup_public_state(uuid, text),
  private.worldcup_admin_state(text),
  private.worldcup_save_prediction(uuid, text, text, text, text),
  private.worldcup_admin_save_setup(text, jsonb, jsonb),
  private.worldcup_admin_set_result(text, text, text, text)
  to anon;

grant execute on function private.worldcup_touch(),
  private.worldcup_is_admin(text),
  private.worldcup_join(text, text),
  private.worldcup_public_state(uuid, text),
  private.worldcup_admin_state(text),
  private.worldcup_save_prediction(uuid, text, text, text, text),
  private.worldcup_admin_save_setup(text, jsonb, jsonb),
  private.worldcup_admin_set_result(text, text, text, text)
  to service_role;

create function public.worldcup_touch()
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.worldcup_touch();
$$;

create function public.worldcup_is_admin(p_pin text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.worldcup_is_admin(p_pin);
$$;

create function public.worldcup_join(p_name text, p_pin text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worldcup_join(p_name, p_pin);
$$;

create function public.worldcup_public_state(
  p_participant_id uuid default null,
  p_pin text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.worldcup_public_state(p_participant_id, p_pin);
$$;

create function public.worldcup_admin_state(p_admin_pin text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.worldcup_admin_state(p_admin_pin);
$$;

create function public.worldcup_save_prediction(
  p_participant_id uuid,
  p_pin text,
  p_match_id text,
  p_team text,
  p_regular text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worldcup_save_prediction(
    p_participant_id,
    p_pin,
    p_match_id,
    p_team,
    p_regular
  );
$$;

create function public.worldcup_admin_save_setup(
  p_admin_pin text,
  p_participants jsonb,
  p_matches jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worldcup_admin_save_setup(
    p_admin_pin,
    p_participants,
    p_matches
  );
$$;

create function public.worldcup_admin_set_result(
  p_admin_pin text,
  p_match_id text,
  p_team text,
  p_regular text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worldcup_admin_set_result(
    p_admin_pin,
    p_match_id,
    p_team,
    p_regular
  );
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

grant execute on function public.worldcup_join(text, text),
  public.worldcup_public_state(uuid, text),
  public.worldcup_admin_state(text),
  public.worldcup_save_prediction(uuid, text, text, text, text),
  public.worldcup_admin_save_setup(text, jsonb, jsonb),
  public.worldcup_admin_set_result(text, text, text, text)
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

create policy "server secret only"
  on public.what_should_eat_users
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "server secret only"
  on public.what_should_eat_sessions
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "server secret only"
  on public.what_should_eat_decisions
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "server secret only"
  on public.what_should_eat_decision_participants
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "server secret only"
  on public.what_should_eat_place_feedback
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "server secret only"
  on public.what_should_eat_comparisons
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "rpc only"
  on public.worldcup_settings
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "rpc only"
  on public.worldcup_participants
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "rpc only"
  on public.worldcup_matches
  for all
  to anon, authenticated
  using (false)
  with check (false);
create policy "rpc only"
  on public.worldcup_predictions
  for all
  to anon, authenticated
  using (false)
  with check (false);
