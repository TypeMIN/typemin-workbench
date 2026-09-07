create index baseball_game_actions_actor_player_idx
  on public.baseball_game_actions (actor_player_id)
  where actor_player_id is not null;

create index baseball_party_events_actor_player_idx
  on public.baseball_party_events (actor_player_id)
  where actor_player_id is not null;
