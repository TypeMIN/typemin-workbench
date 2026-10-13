-- Every deployment now calls the eight-argument commit, so the seven-argument
-- overload kept for the rollout can go.
drop function if exists public.baseball_commit_action(
  uuid, bigint, jsonb, text, jsonb, jsonb, uuid
);

-- Expired rooms are only marked; this removes them (seats, players and the
-- action log cascade) once the retention window has passed.
create function public.baseball_cleanup_expired_rooms(p_retention_days integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if p_retention_days < 1 then
    raise exception 'retention must be at least one day';
  end if;
  delete from public.baseball_games
  where expires_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.baseball_cleanup_expired_rooms(integer)
  from public, anon, authenticated;
grant execute on function public.baseball_cleanup_expired_rooms(integer)
  to service_role;
