#!/usr/bin/env bash
# Database permission and migration tests.
# DANGER: creates roles and tables. Run ONLY against an empty scratch PostgreSQL
# database, never against Supabase production. Requires psql.
#
#   QA_SCRATCH_DB=yes PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=scratch ./qa/db-permissions.sh
set -uo pipefail
[ "${QA_SCRATCH_DB:-}" = "yes" ] || { echo "Refusing to run: set QA_SCRATCH_DB=yes to confirm this is a throwaway database."; exit 2; }
DIR="$(cd "$(dirname "$0")/../backend/migrations" && pwd)"
P="psql -v ON_ERROR_STOP=1 -q"
fails=0
$P -c "select 1" >/dev/null || { echo "Cannot connect"; exit 1; }
$P -c "do \$\$ begin
  if not exists (select from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end \$\$; create schema if not exists auth; create table if not exists auth.users(id uuid primary key); alter table auth.users add column if not exists email text;
grant usage on schema public to anon, authenticated, service_role;" || exit 1
# Apply 001-005, add existing staff (as before usernames existed), then 006 backfills them.
for f in "$DIR"/00[1-5]*.sql; do $P -f "$f" 2>/dev/null || { echo "FAIL migration $(basename "$f")"; exit 1; }; done
$P -c "insert into auth.users(id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'thandi.mokoena@imforce.co.za'),
  ('a0000000-0000-4000-8000-000000000002', 'thandi.mokoena@partner.co.za'),
  ('a0000000-0000-4000-8000-000000000003', 'jo@imforce.co.za'),
  ('a0000000-0000-4000-8000-000000000004', '_sipho+test@imforce.co.za')
  on conflict do nothing;
  insert into public.staff_profiles(user_id) select id from auth.users where id::text like 'a0000000-%' on conflict do nothing;" >/dev/null 2>&1 || true
for run in 1 2; do for f in "$DIR"/00*.sql; do $P -f "$f" 2>/dev/null || { echo "FAIL migration $(basename "$f") (run $run)"; exit 1; }; done; echo "PASS migrations applied (run $run)"; done
$P -c "delete from public.vacancies; insert into public.vacancies (client_name,title,location,region,category,employment_type,summary,closing_date,status) values ('Secret Client','Open role','D','K','A','Permanent','x',null,'published'),('Secret Client','Expired role','D','K','A','Permanent','x',current_date-3,'published'),('Secret Client','Draft role','D','K','A','Permanent','x',null,'draft');"
ok(){ out=$($P -At -c "$3" 2>&1); if [ $? -eq 0 ] && [ "$out" = "$2" ]; then echo "PASS $1"; else echo "FAIL $1 -> $out"; fails=$((fails+1)); fi; }
deny(){ out=$($P -At -c "$2" 2>&1); if echo "$out" | grep -qE "$3"; then echo "PASS $1"; else echo "FAIL $1 -> $out"; fails=$((fails+1)); fi; }
ok   "anon sees only open published roles" "Open role" "begin; set local role anon; select string_agg(title, ',') from public.vacancies; commit;"
deny "anon cannot read client_name" "set role anon; select client_name from public.vacancies;" "permission denied"
deny "anon cannot select *" "set role anon; select * from public.vacancies;" "permission denied"
deny "anon cannot insert vacancy" "set role anon; insert into public.vacancies(client_name,title,location,region,category,employment_type,summary) values ('a','b','c','d','e','Permanent','f');" "permission denied"
for t in contact_inquiries employer_inquiries staff_profiles security_events; do
  deny "anon cannot read $t" "set role anon; select 1 from public.$t;" "permission denied"
  deny "authenticated cannot read $t" "set role authenticated; select 1 from public.$t;" "permission denied"
done
deny "javascript: application URL rejected" "insert into public.vacancies (client_name,title,location,region,category,employment_type,summary,application_url) values ('a','b','c','d','e','Permanent','f','javascript:alert(1)');" "check constraint"
deny "oversized contact message rejected" "insert into public.contact_inquiries(name,email,enquiry_type,subject,message) values ('a','b','c','d',repeat('x',5001));" "check constraint"
deny "invalid severity rejected" "insert into public.security_events(event_type,severity,action,ip_address) values ('x','urgent','logged','1');" "check constraint"
deny "duplicate payment reference rejected" "insert into public.employer_inquiries(details) values ('{\"paymentReference\":\"IMF-dup\"}'),('{\"paymentReference\":\"IMF-dup\"}');" "duplicate key"
deny "anon cannot run purge function" "set role anon; select public.purge_old_security_events();" "permission denied"
ok   "updated_at trigger fires" "t" "update public.vacancies set updated_at = now() - interval '1 day' where title='Open role'; select bool_and(updated_at > now() - interval '1 minute') from public.vacancies where title='Open role';"
# Unique per run: the audit log is append-only, so earlier test rows can never be removed.
marker="qa-$(date +%s)-$$@example.test"
ok   "service_role can append to staff audit log" "1" "set role service_role; insert into public.staff_audit_log(action, actor_email) values ('vacancy.delete','$marker'); select count(*) from public.staff_audit_log where actor_email='$marker';"
deny "service_role cannot edit audit history" "set role service_role; update public.staff_audit_log set actor_email='x';" "permission denied|append-only"
deny "service_role cannot delete audit history" "set role service_role; delete from public.staff_audit_log;" "permission denied|append-only"
deny "database owner cannot edit audit history" "update public.staff_audit_log set actor_email='x';" "append-only"
deny "database owner cannot delete audit history" "delete from public.staff_audit_log;" "append-only"
deny "database owner cannot truncate audit history" "truncate public.staff_audit_log;" "append-only"
deny "unknown audit action rejected" "insert into public.staff_audit_log(action) values ('vacancy.hack');" "check constraint"
deny "anon cannot read audit log" "set role anon; select 1 from public.staff_audit_log;" "permission denied"
deny "authenticated cannot read audit log" "set role authenticated; select 1 from public.staff_audit_log;" "permission denied"
ok   "006 backfill: symbols stripped from derived names" "Sipho Test" "select display_name from public.staff_profiles where user_id = 'a0000000-0000-4000-8000-000000000004';"
ok   "006 backfill: every staff profile has a valid username" "0" "select count(*) from public.staff_profiles where username !~ '^[a-z0-9][a-z0-9._-]{2,31}\$';"
ok   "006 backfill: names derived from email" "Thandi Mokoena" "select display_name from public.staff_profiles where user_id = 'a0000000-0000-4000-8000-000000000001';"
ok   "006 backfill: same email prefix gets a unique username" "thandi.mokoena,thandi.mokoena2" "select string_agg(username, ',' order by username) from public.staff_profiles where user_id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002');"
deny "duplicate username rejected" "update public.staff_profiles set username = 'thandi.mokoena' where user_id = 'a0000000-0000-4000-8000-000000000003';" "duplicate key"
deny "username with spaces or capitals rejected" "update public.staff_profiles set username = 'Thandi M' where user_id = 'a0000000-0000-4000-8000-000000000003';" "check constraint"
deny "staff profile without a name rejected" "update public.staff_profiles set display_name = ' ' where user_id = 'a0000000-0000-4000-8000-000000000003';" "check constraint"
deny "anon cannot read usernames" "set role anon; select username from public.staff_profiles;" "permission denied"
echo; [ $fails -eq 0 ] && echo "All database checks passed." || { echo "$fails database check(s) failed."; exit 1; }
