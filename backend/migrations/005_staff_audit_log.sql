-- 005: Append-only audit trail of staff actions (who did what, when, from where).
-- Safe to run more than once.

create table if not exists public.staff_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text check (char_length(actor_email) <= 254),
  action text not null check (action in (
    'staff.login', 'staff.logout', 'enquiries.view',
    'vacancy.create', 'vacancy.update', 'vacancy.delete'
  )),
  entity_type text check (char_length(entity_type) <= 40),
  entity_id text check (char_length(entity_id) <= 64),
  ip_address text check (char_length(ip_address) <= 64),
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) <= 4096)
);
create index if not exists staff_audit_log_recent on public.staff_audit_log (occurred_at desc);
create index if not exists staff_audit_log_by_actor on public.staff_audit_log (actor_user_id, occurred_at desc);

alter table public.staff_audit_log enable row level security;
revoke all on public.staff_audit_log from public, anon, authenticated;
-- The API may only add and read entries; nobody can quietly edit history.
revoke update, delete, truncate on public.staff_audit_log from service_role;
grant select, insert on public.staff_audit_log to service_role;

-- Belt and braces: block edits and deletes even by roles that bypass grants.
create or replace function public.staff_audit_log_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'staff_audit_log is append-only';
end;
$$;
drop trigger if exists staff_audit_log_no_update on public.staff_audit_log;
create trigger staff_audit_log_no_update before update or delete on public.staff_audit_log
  for each row execute function public.staff_audit_log_is_append_only();
drop trigger if exists staff_audit_log_no_truncate on public.staff_audit_log;
create trigger staff_audit_log_no_truncate before truncate on public.staff_audit_log
  for each statement execute function public.staff_audit_log_is_append_only();
