create policy "baseball games are server only"
  on public.baseball_games
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "baseball seats are server only"
  on public.baseball_game_seats
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy "baseball actions are server only"
  on public.baseball_game_actions
  for all
  to anon, authenticated
  using (false)
  with check (false);
