create table if not exists public.staff_allowlist (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint staff_allowlist_email_format
    check (email = lower(email) and position('@' in email) > 1)
);

alter table public.staff_allowlist enable row level security;
revoke all on public.staff_allowlist from anon, authenticated;

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
grant execute on function public.is_staff() to anon, authenticated;

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

alter table public.vacancies enable row level security;
alter table public.vacancy_private_details enable row level security;
alter table public.contact_enquiries enable row level security;

revoke all on public.vacancies from anon, authenticated;
revoke all on public.vacancy_private_details from anon, authenticated;
revoke all on public.contact_enquiries from anon, authenticated;

grant select on public.vacancies to anon, authenticated;
grant insert, update, delete on public.vacancies to authenticated;
grant select, insert, update, delete on public.vacancy_private_details to authenticated;
grant select on public.contact_enquiries to authenticated;
grant insert on public.contact_enquiries to service_role;

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
