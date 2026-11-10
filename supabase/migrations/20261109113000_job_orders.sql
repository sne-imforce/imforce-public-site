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

alter table public.job_orders enable row level security;
revoke all on public.job_orders from anon, authenticated;
grant select on public.job_orders to authenticated;
grant insert on public.job_orders to service_role;

drop policy if exists "Staff can read job orders" on public.job_orders;
create policy "Staff can read job orders"
  on public.job_orders for select
  to authenticated
  using (public.is_staff());

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

drop policy if exists "Staff can read job order attachments" on storage.objects;
create policy "Staff can read job order attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-order-files'
    and public.is_staff()
  );
