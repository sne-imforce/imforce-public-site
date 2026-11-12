-- 008: Human advert review for employer job orders.
-- "An IMFORCE team member must approve the advert before it goes online."
-- Records reviewer, time, decision and reason (developer scope §6).
-- Safe to run more than once.

alter table public.employer_inquiries add column if not exists review_status text not null default 'pending';
alter table public.employer_inquiries add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.employer_inquiries add column if not exists reviewed_by_name text;
alter table public.employer_inquiries add column if not exists reviewed_at timestamptz;
alter table public.employer_inquiries add column if not exists review_reason text;
alter table public.employer_inquiries add column if not exists vacancy_id uuid references public.vacancies(id) on delete set null;

alter table public.employer_inquiries drop constraint if exists employer_inquiries_review_status_check;
alter table public.employer_inquiries add constraint employer_inquiries_review_status_check
  check (review_status in ('pending', 'approved', 'changes_requested', 'rejected'));
alter table public.employer_inquiries drop constraint if exists employer_inquiries_review_reason_length;
alter table public.employer_inquiries add constraint employer_inquiries_review_reason_length
  check (review_reason is null or char_length(review_reason) between 5 and 1000);
alter table public.employer_inquiries drop constraint if exists employer_inquiries_review_complete;
alter table public.employer_inquiries add constraint employer_inquiries_review_complete
  check (review_status = 'pending' or (reviewed_at is not null and reviewed_by_name is not null));
alter table public.employer_inquiries drop constraint if exists employer_inquiries_reason_required;
alter table public.employer_inquiries add constraint employer_inquiries_reason_required
  check (review_status not in ('changes_requested', 'rejected') or review_reason is not null);

create index if not exists employer_inquiries_review_queue on public.employer_inquiries (review_status, created_at desc);

-- Allow the review decisions in the audit trail.
alter table public.staff_audit_log drop constraint if exists staff_audit_log_action_check;
alter table public.staff_audit_log add constraint staff_audit_log_action_check check (action in (
  'staff.login', 'staff.logout', 'enquiries.view',
  'vacancy.create', 'vacancy.update', 'vacancy.delete',
  'device.trust', 'device.forget',
  'advert.approve', 'advert.request_changes', 'advert.reject', 'advert.reopen'
));
