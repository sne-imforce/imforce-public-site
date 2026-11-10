-- IMFORCE Supabase database setup.
-- Run once in the SQL Editor for the project configured in frontend/.env.local.
-- Safe to re-run for these application objects; does not create Auth users.
-- Removes the unused challenge nonce table from the previous ALTCHA setup.

begin;

drop table if exists public.altcha_used_challenges;

create table if not exists public.staff_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint staff_allowlist_email_format
    check (email = lower(email) and position('@' in email) > 1)
);

create table if not exists public.vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 160),
  location text not null check (length(btrim(location)) between 1 and 160),
  region text not null check (length(btrim(region)) between 1 and 100),
  industry text,
  category text not null check (length(btrim(category)) between 1 and 100),
  employment_type text not null check (length(btrim(employment_type)) between 1 and 80),
  salary text check (salary is null or length(salary) <= 120),
  application_url text check (
    application_url is null or
    (length(application_url) <= 2048 and application_url ~ '^https://')
  ),
  summary text not null check (length(btrim(summary)) between 1 and 4000),
  responsibilities text[] not null default '{}'
    check (cardinality(responsibilities) <= 40),
  is_urgent boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vacancy_private_details (
  vacancy_id uuid primary key references public.vacancies(id) on delete cascade,
  client_name text not null check (length(btrim(client_name)) between 1 and 200)
);

create table if not exists public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  phone text check (phone is null or length(phone) <= 40),
  enquiry_type text not null check (
    enquiry_type in (
      'Hiring and permanent staffing',
      'Job opportunities',
      'Other enquiry'
    )
  ),
  subject text not null check (length(btrim(subject)) between 1 and 160),
  message text not null check (length(btrim(message)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.job_orders (
  id uuid primary key default gen_random_uuid(),
  legal_company_name text not null
    check (length(btrim(legal_company_name)) between 1 and 200),
  trading_name text
    check (trading_name is null or length(trading_name) <= 200),
  registration_number text not null
    check (length(btrim(registration_number)) between 1 and 80),
  vat_number text check (vat_number is null or length(vat_number) <= 80),
  company_address text not null
    check (length(btrim(company_address)) between 1 and 500),
  contact_name text not null
    check (length(btrim(contact_name)) between 1 and 120),
  contact_email text not null
    check (length(contact_email) between 3 and 254),
  contact_phone text not null
    check (length(btrim(contact_phone)) between 1 and 40),
  billing_contact text not null
    check (length(btrim(billing_contact)) between 1 and 120),
  billing_address text not null
    check (length(btrim(billing_address)) between 1 and 500),
  job_title text not null check (length(btrim(job_title)) between 1 and 160),
  job_location text not null
    check (length(btrim(job_location)) between 1 and 200),
  number_of_hires integer not null check (number_of_hires between 1 and 500),
  employment_type text not null
    check (employment_type in ('Permanent', 'Contract', 'Fixed-term', 'Temporary')),
  working_hours text not null
    check (length(btrim(working_hours)) between 1 and 120),
  salary_type text not null check (salary_type in ('specified', 'market')),
  salary text not null check (length(btrim(salary)) between 1 and 120),
  closing_date date,
  duties text not null check (length(btrim(duties)) between 1 and 4000),
  requirements text not null
    check (length(btrim(requirements)) between 1 and 4000),
  qualifications text not null
    check (length(btrim(qualifications)) between 1 and 3000),
  authorized_contact boolean not null check (authorized_contact),
  attachment_path text,
  attachment_name text
    check (attachment_name is null or length(attachment_name) <= 180),
  status text not null default 'new' check (status = 'new'),
  created_at timestamptz not null default now(),
  constraint job_orders_attachment_pair check (
    (attachment_path is null and attachment_name is null) or
    (attachment_path is not null and attachment_name is not null)
  )
);

create index if not exists job_orders_created_at_idx
  on public.job_orders (created_at desc);

alter table public.staff_allowlist enable row level security;
alter table public.vacancies enable row level security;
alter table public.vacancy_private_details enable row level security;
alter table public.contact_enquiries enable row level security;
alter table public.job_orders enable row level security;

revoke all on table public.staff_allowlist
  from public, anon, authenticated;
revoke all on table public.vacancies
  from public, anon, authenticated;
revoke all on table public.vacancy_private_details
  from public, anon, authenticated;
revoke all on table public.contact_enquiries
  from public, anon, authenticated;
revoke all on table public.job_orders
  from public, anon, authenticated;

grant select on table public.vacancies to anon, authenticated;
grant insert, update, delete on table public.vacancies to authenticated;
grant select, insert, update, delete
  on table public.vacancy_private_details to authenticated;
grant select on table public.contact_enquiries to authenticated;
grant insert on table public.contact_enquiries to service_role;
grant select on table public.job_orders to authenticated;
grant insert on table public.job_orders to service_role;

create table if not exists public.honeytoken_events (
  id uuid primary key default gen_random_uuid(),
  trap_id text not null check (length(btrim(trap_id)) between 1 and 80),
  path text not null check (length(path) between 1 and 300),
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  client_ip text check (client_ip is null or length(client_ip) <= 80),
  referrer text check (referrer is null or length(referrer) <= 300),
  detail text check (detail is null or length(detail) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists honeytoken_events_created_at_idx
  on public.honeytoken_events (created_at desc);

create index if not exists honeytoken_events_client_ip_created_at_idx
  on public.honeytoken_events (client_ip, created_at desc);

alter table public.honeytoken_events enable row level security;
revoke all on table public.honeytoken_events
  from public, anon, authenticated;
grant select on table public.honeytoken_events to authenticated;
grant insert on table public.honeytoken_events to service_role;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'staff_allowlist',
        'vacancies',
        'vacancy_private_details',
        'contact_enquiries',
        'job_orders',
        'honeytoken_events'
      )
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end;
$$;

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
revoke all on function public.is_staff() from anon;
grant execute on function public.is_staff() to authenticated;

create policy "Anyone can read published vacancies"
  on public.vacancies for select
  to anon, authenticated
  using (is_published or public.is_staff());

create policy "Staff can insert vacancies"
  on public.vacancies for insert
  to authenticated
  with check (public.is_staff());

create policy "Staff can update vacancies"
  on public.vacancies for update
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can delete vacancies"
  on public.vacancies for delete
  to authenticated
  using (public.is_staff());

create policy "Staff can manage private vacancy details"
  on public.vacancy_private_details for all
  to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create policy "Staff can read contact enquiries"
  on public.contact_enquiries for select
  to authenticated
  using (public.is_staff());

create policy "Staff can read job orders"
  on public.job_orders for select
  to authenticated
  using (public.is_staff());

create policy "Staff can read honeytoken events"
  on public.honeytoken_events for select
  to authenticated
  using (public.is_staff());

create or replace function public.save_vacancy(
  p_id uuid,
  p_client_name text,
  p_title text,
  p_location text,
  p_region text,
  p_industry text,
  p_category text,
  p_employment_type text,
  p_salary text,
  p_application_url text,
  p_summary text,
  p_responsibilities text[],
  p_is_urgent boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.vacancies (
      title, location, region, industry, category, employment_type,
      salary, application_url, summary, responsibilities, is_urgent
    ) values (
      p_title, p_location, p_region, p_industry, p_category, p_employment_type,
      nullif(p_salary, ''), p_application_url, p_summary, p_responsibilities, p_is_urgent
    )
    returning id into saved_id;
  else
    update public.vacancies
    set title = p_title,
        location = p_location,
        region = p_region,
        industry = p_industry,
        category = p_category,
        employment_type = p_employment_type,
        salary = nullif(p_salary, ''),
        application_url = p_application_url,
        summary = p_summary,
        responsibilities = p_responsibilities,
        is_urgent = p_is_urgent,
        updated_at = now()
    where id = p_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Vacancy not found';
    end if;
  end if;

  insert into public.vacancy_private_details (vacancy_id, client_name)
  values (saved_id, p_client_name)
  on conflict (vacancy_id)
  do update set client_name = excluded.client_name;

  return saved_id;
end;
$$;

revoke all on function public.save_vacancy(
  uuid, text, text, text, text, text, text, text, text, text, text, text[], boolean
) from public;
grant execute on function public.save_vacancy(
  uuid, text, text, text, text, text, text, text, text, text, text, text[], boolean
) to authenticated;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'job-order-files',
  'job-order-files',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Staff can read job order attachments"
  on storage.objects;
create policy "Staff can read job order attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-order-files'
    and public.is_staff()
  );

notify pgrst, 'reload schema';
commit;
