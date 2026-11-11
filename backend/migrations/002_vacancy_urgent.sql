alter table public.vacancies
  add column if not exists is_urgent boolean not null default false;
