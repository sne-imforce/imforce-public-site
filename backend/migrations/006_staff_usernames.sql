-- 006: Staff usernames and display names.
-- Staff sign in with a username (not their email). The agent's name is shown in
-- the workspace and recorded in the audit log. Passwords are NOT stored here:
-- Supabase Auth keeps only a one-way bcrypt hash in auth.users.
-- Safe to run more than once.

alter table public.staff_profiles add column if not exists username text;
alter table public.staff_profiles add column if not exists display_name text;

-- Backfill existing staff from their email so nobody is locked out:
-- "thandi.mokoena@imforce.co.za" -> username "thandi.mokoena", name "Thandi Mokoena".
-- Review and adjust the generated values after running this migration.
with base as (
  select
    p.user_id,
    left(regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9._-]', '', 'g'), 28) as raw_username,
    initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^A-Za-z]+', ' ', 'g'))) as raw_name
  from public.staff_profiles p
  join auth.users u on u.id = p.user_id
  where p.username is null
),
cleaned as (
  select
    user_id,
    raw_name,
    case when length(raw_username) < 3 or raw_username !~ '^[a-z0-9]' then 'staff' || raw_username else raw_username end as candidate
  from base
),
numbered as (
  select
    c.user_id,
    c.raw_name,
    c.candidate,
    row_number() over (partition by c.candidate order by c.user_id) as n,
    exists (select 1 from public.staff_profiles taken where taken.username = c.candidate) as already_taken
  from cleaned c
)
update public.staff_profiles p
set
  username = case when numbered.n = 1 and not numbered.already_taken then numbered.candidate
                  else numbered.candidate || numbered.n::text end,
  display_name = coalesce(p.display_name, nullif(trim(numbered.raw_name), ''), 'IMFORCE staff')
from numbered
where p.user_id = numbered.user_id;

update public.staff_profiles set display_name = coalesce(display_name, username, 'IMFORCE staff') where display_name is null;

alter table public.staff_profiles alter column username set not null;
alter table public.staff_profiles alter column display_name set not null;

alter table public.staff_profiles drop constraint if exists staff_profiles_username_format;
alter table public.staff_profiles add constraint staff_profiles_username_format
  check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
alter table public.staff_profiles drop constraint if exists staff_profiles_display_name_length;
alter table public.staff_profiles add constraint staff_profiles_display_name_length
  check (char_length(trim(display_name)) between 2 and 80);
create unique index if not exists staff_profiles_username_unique on public.staff_profiles (username);

-- Record the agent's name alongside their email in the audit trail.
alter table public.staff_audit_log add column if not exists actor_name text;
alter table public.staff_audit_log drop constraint if exists staff_audit_log_actor_name_length;
alter table public.staff_audit_log add constraint staff_audit_log_actor_name_length
  check (actor_name is null or char_length(actor_name) <= 80);
