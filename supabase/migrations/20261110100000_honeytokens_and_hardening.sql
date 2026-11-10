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
revoke all on table public.honeytoken_events from public, anon, authenticated;
grant select on table public.honeytoken_events to authenticated;
grant insert on table public.honeytoken_events to service_role;

drop policy if exists "Staff can read honeytoken events" on public.honeytoken_events;
create policy "Staff can read honeytoken events"
  on public.honeytoken_events for select
  to authenticated
  using (public.is_staff());

revoke all on function public.is_staff() from public;
revoke all on function public.is_staff() from anon;
grant execute on function public.is_staff() to authenticated;

notify pgrst, 'reload schema';
