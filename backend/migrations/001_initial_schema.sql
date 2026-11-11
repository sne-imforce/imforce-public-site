create extension if not exists pgcrypto;

create table if not exists public.vacancies (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  title text not null,
  location text not null,
  region text not null,
  industry text,
  category text not null,
  employment_type text not null check (employment_type in ('Permanent', 'Contract', 'Fixed-term', 'Temporary')),
  is_urgent boolean not null default false,
  closing_date date,
  salary text,
  application_url text,
  summary text not null,
  responsibilities jsonb not null default '[]'::jsonb,
  status text not null default 'published' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vacancies_public_order on public.vacancies (created_at desc) where status = 'published';

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null default '',
  enquiry_type text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.employer_inquiries (
  id uuid primary key default gen_random_uuid(),
  details jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.vacancies enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.contact_inquiries enable row level security;
alter table public.employer_inquiries enable row level security;

drop policy if exists "Published vacancies are public" on public.vacancies;
create policy "Published vacancies are public" on public.vacancies for select to anon, authenticated using (status = 'published');
-- All writes are performed by the API using the server-only service role key.
-- Staff accounts are provisioned in Supabase Auth, then their UUID is added to staff_profiles.

revoke all on public.staff_profiles from anon, authenticated;
revoke all on public.contact_inquiries from anon, authenticated;
revoke all on public.employer_inquiries from anon, authenticated;
grant select on public.vacancies to anon, authenticated;
grant all on public.vacancies, public.staff_profiles, public.contact_inquiries, public.employer_inquiries to service_role;

