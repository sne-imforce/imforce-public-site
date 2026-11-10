# IMFORCE public site

The frontend serves public recruitment pages for candidates and employers. Candidates can browse current vacancies and enquire about a role. Employers can submit a job order enquiry. Authorized staff sign in to manage vacancies. The API server stores these records in Supabase.

## Supabase setup

1. For a new database, run [`backend/migrations/001_initial_schema.sql`](backend/migrations/001_initial_schema.sql) in the Supabase SQL editor. For an existing setup, apply any later migration files in order: [`002_vacancy_urgent.sql`](backend/migrations/002_vacancy_urgent.sql) adds the urgent flag and [`003_vacancy_closing_date.sql`](backend/migrations/003_vacancy_closing_date.sql) adds the optional closing date.
2. Copy `backend/.env.example` to `backend/.env`. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` to the project's publishable key, and `SUPABASE_SERVICE_ROLE_KEY` to its server-only secret key (or use the legacy anon/service_role JWTs). Keep the secret key on the server only.
3. Copy `frontend/.env.example` to `frontend/.env.local`. Set `VITE_API_BASE_URL` to the API origin (usually `http://localhost:3001` for local development).
4. Create staff accounts in Supabase Auth. Add each approved user's UUID to `public.staff_profiles` with `active = true`; access is denied unless that row exists.

The repository does not contain Supabase project credentials, so configure them before expecting live records or staff login to work.

## Run locally

In `backend`, run `npm install` and `npm run dev`. In `frontend`, run `npm install` and `npm run dev`. Set `FRONTEND_ORIGIN` to the exact deployed frontend origin(s), comma separated, in production.

## Data and access

- The public API lists published vacancies only and hides them after an optional closing date.
- Vacancy writes and staff authorization use the server-only service role key. The API verifies the Supabase Auth access token and an active `staff_profiles` row on every staff request.
- Contact and employer inquiries are accepted through server-side validation. Inquiry tables have RLS enabled and no browser roles granted.
- Candidate role enquiries use the contact form. File uploads and payments are not part of this flow.
