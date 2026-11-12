-- 007: "Remember this device for 30 days" for staff two-factor sign-in.
-- After a staff member enters their authenticator code and ticks "Remember this
-- device", the browser keeps a random token in an HttpOnly cookie. Only its
-- SHA-256 hash is stored here, so a database leak does not reveal usable tokens.
-- Devices expire after 30 days and can be revoked at any time.
-- Safe to run more than once.

create table if not exists public.staff_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '31 days')
);
create index if not exists staff_trusted_devices_active on public.staff_trusted_devices (user_id) where revoked_at is null;

alter table public.staff_trusted_devices enable row level security;
revoke all on public.staff_trusted_devices from public, anon, authenticated;
grant select, insert, update on public.staff_trusted_devices to service_role;

-- Allow the new audit actions.
alter table public.staff_audit_log drop constraint if exists staff_audit_log_action_check;
alter table public.staff_audit_log add constraint staff_audit_log_action_check check (action in (
  'staff.login', 'staff.logout', 'enquiries.view',
  'vacancy.create', 'vacancy.update', 'vacancy.delete',
  'device.trust', 'device.forget'
));

-- Lost or stolen laptop: revoke every remembered device for a staff member with
--   update public.staff_trusted_devices set revoked_at = now()
--   where user_id = '<uuid>' and revoked_at is null;
