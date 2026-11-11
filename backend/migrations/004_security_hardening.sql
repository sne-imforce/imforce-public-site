-- 004: Security hardening (QA / secure-SDLC review, November 2026)
-- Safe to run more than once. New CHECK constraints are NOT VALID so existing
-- rows are not rejected; run the VALIDATE statements at the end after cleanup.

-- 1. Confidential client names must not be readable with the public anon key.
--    Before this, anyone holding the anon key could call
--    /rest/v1/vacancies?select=client_name and list IMFORCE's clients.
revoke select on public.vacancies from anon, authenticated;
grant select (
  id, title, location, region, industry, category, employment_type, is_urgent,
  closing_date, salary, application_url, summary, responsibilities, status, created_at, updated_at
) on public.vacancies to anon, authenticated;

-- 2. Hide expired vacancies at the database layer too, not only in the API.
drop policy if exists "Published vacancies are public" on public.vacancies;
create policy "Published vacancies are public" on public.vacancies
  for select to anon, authenticated
  using (status = 'published' and (closing_date is null or closing_date >= (now() at time zone 'Africa/Johannesburg')::date));

-- 3. Defence-in-depth length and format limits that mirror the API validation.
alter table public.vacancies drop constraint if exists vacancies_application_url_https;
alter table public.vacancies add constraint vacancies_application_url_https
  check (application_url is null or (application_url ~ '^https://' and char_length(application_url) <= 500)) not valid;
alter table public.vacancies drop constraint if exists vacancies_text_lengths;
alter table public.vacancies add constraint vacancies_text_lengths check (
  char_length(client_name) <= 160 and char_length(title) <= 160 and char_length(location) <= 160
  and char_length(region) <= 100 and char_length(category) <= 100 and char_length(summary) <= 3000
) not valid;
alter table public.contact_inquiries drop constraint if exists contact_inquiries_lengths;
alter table public.contact_inquiries add constraint contact_inquiries_lengths check (
  char_length(name) <= 120 and char_length(email) <= 254 and char_length(phone) <= 40
  and char_length(subject) <= 160 and char_length(message) <= 5000
) not valid;

-- 4. Keep updated_at accurate for audit purposes.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists vacancies_touch_updated_at on public.vacancies;
create trigger vacancies_touch_updated_at before update on public.vacancies
  for each row execute function public.touch_updated_at();

-- 5. Payment references are unique and looked up on every verification/webhook.
create unique index if not exists employer_inquiries_payment_reference
  on public.employer_inquiries ((details->>'paymentReference'))
  where details ? 'paymentReference';

-- 6. Intrusion-detection audit trail written by the API ("alarm" events).
create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_type text not null check (char_length(event_type) <= 60),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  action text not null check (action in ('logged', 'blocked', 'alert-only')),
  ip_address text not null check (char_length(ip_address) <= 64),
  method text check (char_length(method) <= 10),
  path text check (char_length(path) <= 300),
  user_agent text check (char_length(user_agent) <= 200),
  detail text check (char_length(detail) <= 300),
  threat_score integer not null default 0
);
create index if not exists security_events_recent on public.security_events (occurred_at desc);
create index if not exists security_events_by_ip on public.security_events (ip_address, occurred_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select, insert on public.security_events to service_role;
grant usage on all sequences in schema public to service_role;

-- Retention: keep 180 days of security events (POPIA data minimisation).
-- Schedule with pg_cron if enabled:  select cron.schedule('purge-security-events', '17 3 * * *', 'select public.purge_old_security_events()');
create or replace function public.purge_old_security_events() returns integer
language sql security definer set search_path = '' as $$
  with deleted as (delete from public.security_events where occurred_at < now() - interval '180 days' returning 1)
  select count(*)::integer from deleted;
$$;
revoke all on function public.purge_old_security_events() from public, anon, authenticated;

-- 7. Lock down default privileges so future tables are not exposed by accident.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- After cleaning any legacy rows that break the new limits, enforce them for all rows:
-- alter table public.vacancies validate constraint vacancies_application_url_https;
-- alter table public.vacancies validate constraint vacancies_text_lengths;
-- alter table public.contact_inquiries validate constraint contact_inquiries_lengths;
