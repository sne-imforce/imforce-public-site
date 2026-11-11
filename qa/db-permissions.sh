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
end \$\$; create schema if not exists auth; create table if not exists auth.users(id uuid primary key);
grant usage on schema public to anon, authenticated, service_role;" || exit 1
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
echo; [ $fails -eq 0 ] && echo "All database checks passed." || { echo "$fails database check(s) failed."; exit 1; }
