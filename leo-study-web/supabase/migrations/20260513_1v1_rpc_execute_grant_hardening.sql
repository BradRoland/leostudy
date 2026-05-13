-- Restrict 1v1 SECURITY DEFINER RPCs to signed-in users only.
-- The functions already check auth.uid(), but removing PUBLIC/anon execute keeps
-- the RPC surface aligned with the app's signed-in 1v1 flow.

revoke all on function public.create_1v1_invite(uuid, text, text, integer) from public, anon;
grant execute on function public.create_1v1_invite(uuid, text, text, integer) to authenticated, service_role;

revoke all on function public.respond_1v1_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_1v1_invite(uuid, boolean) to authenticated, service_role;

revoke all on function public.list_pending_1v1_invites() from public, anon;
grant execute on function public.list_pending_1v1_invites() to authenticated, service_role;

revoke all on function public.list_online_1v1_users(integer) from public, anon;
grant execute on function public.list_online_1v1_users(integer) to authenticated, service_role;

revoke all on function public.create_1v1_room(text, text, boolean) from public, anon;
grant execute on function public.create_1v1_room(text, text, boolean) to authenticated, service_role;

revoke all on function public.create_1v1_room(text, text, boolean, integer) from public, anon;
grant execute on function public.create_1v1_room(text, text, boolean, integer) to authenticated, service_role;

revoke all on function public.join_1v1_room(uuid, text) from public, anon;
grant execute on function public.join_1v1_room(uuid, text) to authenticated, service_role;

revoke all on function public.leave_1v1_room(uuid) from public, anon;
grant execute on function public.leave_1v1_room(uuid) to authenticated, service_role;

revoke all on function public.delete_1v1_room(uuid) from public, anon;
grant execute on function public.delete_1v1_room(uuid) to authenticated, service_role;

revoke all on function public.list_public_1v1_rooms() from public, anon;
grant execute on function public.list_public_1v1_rooms() to authenticated, service_role;

revoke all on function public.get_1v1_room_details(uuid) from public, anon;
grant execute on function public.get_1v1_room_details(uuid) to authenticated, service_role;

revoke all on function public.set_1v1_ready(uuid, boolean) from public, anon;
grant execute on function public.set_1v1_ready(uuid, boolean) to authenticated, service_role;

revoke all on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) from public, anon;
grant execute on function public.submit_1v1_round(uuid, integer, boolean, integer, integer) to authenticated, service_role;

revoke all on function public.forfeit_1v1_match(uuid) from public, anon;
grant execute on function public.forfeit_1v1_match(uuid) to authenticated, service_role;

revoke all on function public.send_1v1_waiting_chat_message(uuid, text) from public, anon;
grant execute on function public.send_1v1_waiting_chat_message(uuid, text) to authenticated, service_role;

revoke all on function public.list_1v1_waiting_chat_messages(uuid, integer) from public, anon;
grant execute on function public.list_1v1_waiting_chat_messages(uuid, integer) to authenticated, service_role;

revoke all on function public.rematch_1v1_room(uuid, text) from public, anon;
grant execute on function public.rematch_1v1_room(uuid, text) to authenticated, service_role;

revoke all on function public.cleanup_inactive_1v1_rooms() from public, anon;
grant execute on function public.cleanup_inactive_1v1_rooms() to authenticated, service_role;

revoke all on function public.finish_1v1_room_by_score(uuid) from public, anon, authenticated;
grant execute on function public.finish_1v1_room_by_score(uuid) to service_role;

revoke all on function public.process_1v1_room_completion() from public, anon, authenticated;
grant execute on function public.process_1v1_room_completion() to service_role;

revoke all on function public.clear_1v1_ready_on_start() from public, anon, authenticated;
grant execute on function public.clear_1v1_ready_on_start() to service_role;

notify pgrst, 'reload schema';
