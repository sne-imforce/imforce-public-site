create table if not exists public.altcha_used_challenges (
  nonce text primary key,
  created_at timestamptz not null default now()
);

alter table public.altcha_used_challenges enable row level security;
revoke all on public.altcha_used_challenges from public, anon, authenticated;
grant insert, delete on public.altcha_used_challenges to service_role;
