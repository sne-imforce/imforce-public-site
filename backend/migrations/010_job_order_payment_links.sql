-- 010: Pay for an existing job order instead of creating a duplicate.
-- 'checkout' links let the employer retry payment from the same browser tab;
-- 'staff' links are emailed by staff to follow up an unpaid job order.
-- Only the SHA-256 hash of each link token is stored. Safe to run more than once.

create table if not exists public.job_order_payment_links (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.employer_inquiries(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text not null check (purpose in ('checkout', 'staff')),
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text check (char_length(created_by_name) <= 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  email_status text not null default 'not_sent' check (email_status in ('sent', 'failed', 'not_configured', 'not_sent')),
  emailed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '15 days')
);
create index if not exists job_order_payment_links_by_order on public.job_order_payment_links (order_id, created_at desc);

alter table public.job_order_payment_links enable row level security;
revoke all on public.job_order_payment_links from public, anon, authenticated;
grant select, insert, update on public.job_order_payment_links to service_role;

-- The audit log is append-only, so the action list applies to new entries
-- (NOT VALID): re-running an older migration never fails on newer actions.
alter table public.staff_audit_log drop constraint if exists staff_audit_log_action_check;
alter table public.staff_audit_log add constraint staff_audit_log_action_check check (action in (
  'staff.login', 'staff.logout', 'enquiries.view',
  'vacancy.create', 'vacancy.update', 'vacancy.delete',
  'device.trust', 'device.forget',
  'advert.approve', 'advert.request_changes', 'advert.reject', 'advert.reopen',
  'advert.change_link_resent', 'advert.resubmitted',
  'payment.link_sent'
)) not valid;
