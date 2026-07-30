-- Durcissement signalé par les advisors : pas d'exécution anonyme des
-- fonctions SECURITY DEFINER, et search_path figé partout.

alter function public.assert_lab_context() set search_path = public;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_lab_id() from public, anon;
revoke execute on function public.set_active_lab(integer) from public, anon;
revoke execute on function public.assert_lab_context() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
