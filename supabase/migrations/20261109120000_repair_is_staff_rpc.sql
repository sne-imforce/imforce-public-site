create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_allowlist
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

notify pgrst, 'reload schema';
