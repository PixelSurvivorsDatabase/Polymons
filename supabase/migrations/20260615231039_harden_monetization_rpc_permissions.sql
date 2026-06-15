alter function public.purchase_avatar_item_with_tix(uuid, text)
  security invoker;

alter function public.purchase_game_pass_with_tix(uuid, uuid)
  security invoker;

alter function public.purchase_developer_product_with_tix(uuid, uuid)
  security invoker;

alter function public.player_has_game_badge(uuid, uuid, text)
  security invoker;

revoke all on function public.purchase_avatar_item_with_tix(uuid, text)
  from public, anon, authenticated;
revoke all on function public.purchase_game_pass_with_tix(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.purchase_developer_product_with_tix(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.player_has_game_badge(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.purchase_avatar_item_with_tix(uuid, text)
  to service_role;
grant execute on function public.purchase_game_pass_with_tix(uuid, uuid)
  to service_role;
grant execute on function public.purchase_developer_product_with_tix(uuid, uuid)
  to service_role;
grant execute on function public.player_has_game_badge(uuid, uuid, text)
  to service_role;
