-- 009: "Request changes" sends the employer a private, one-time link to update
-- their job order. Only the SHA-256 hash of the link token is stored.
-- Safe to run more than once.

create table if not exists public.job_order_change_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.employer_inquiries(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(reason) between 5 and 1000),
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text check (char_length(requested_by_name) <= 80),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  email_status text not null default 'not_sent' check (email_status in ('sent', 'failed', 'not_configured', 'not_sent')),
  emailed_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > requested_at and expires_at <= requested_at + interval '15 days')
);
create index if not exists job_order_change_requests_by_order on public.job_order_change_requests (order_id, requested_at desc);

alter table public.job_order_change_requests enable row level security;
revoke all on public.job_order_change_requests from public, anon, authenticated;
-- History is kept: links are revoked or marked used, never deleted.
grant select, insert, update on public.job_order_change_requests to service_role;

-- New audit actions: the employer resubmitting, and staff re-sending a link.
-- The audit log is append-only, so the action list applies to new entries
-- (NOT VALID): re-running an older migration never fails on newer actions.
alter table public.staff_audit_log drop constraint if exists staff_audit_log_action_check;
alter table public.staff_audit_log add constraint staff_audit_log_action_check check (action in (
  'staff.login', 'staff.logout', 'enquiries.view',
  'vacancy.create', 'vacancy.update', 'vacancy.delete',
  'device.trust', 'device.forget',
  'advert.approve', 'advert.request_changes', 'advert.reject', 'advert.reopen',
  'advert.change_link_resent', 'advert.resubmitted'
)) not valid;
