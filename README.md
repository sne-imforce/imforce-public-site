# IMFORCE public site

React/TypeScript frontend with an Express API backed by Supabase. See [production readiness and remaining release gates](./PRODUCTION_READINESS.md) before deployment.

**Documentation**

- [Project documentation](./docs/PROJECT_DOCUMENTATION.md): scope, tech stack, external services, architecture, API reference, database, security and alarm system, configuration, deployment and runbooks.
- [QA and security review](./docs/QA_SECURITY_REVIEW.md): findings, fixes, test evidence and the go-live checklist.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and set the Supabase project URL and keys. Keep the service-role key server-side and out of version control. Apply `backend/migrations/001`–`005` to the Supabase project in order. Staff sign-in requires an authenticator app (TOTP) by default; see the project documentation.
2. In `backend`, run `npm ci` then `npm run dev`.
3. In `frontend`, run `npm ci` then `npm run dev`.
4. Set `VITE_API_BASE_URL` in the frontend environment only when the API is not served from the same origin; it must be the API origin, without a trailing slash.

The Vite development server defaults to port 5173 and the API defaults to 3001. Production must use an HTTPS `FRONTEND_ORIGIN`, a secret manager for backend credentials, HTTPS end to end, and verified proxy settings.

## Available frontend commands

- `npm run dev` starts Vite.
- `npm run lint` runs ESLint.
- `npm run build` type-checks and creates the production bundle (with a strict Content-Security-Policy).

## Tests

- `cd backend && npm test` runs the API security regression suite (offline; all external services are mocked).
- `qa/e2e-smoke.cjs` runs the browser end-to-end checks and `qa/db-permissions.sh` runs the database permission checks (scratch database only). See the QA review for how to run them.

## API

The API uses Helmet, CORS origin allowlisting, bounded JSON bodies, request validation, Supabase calls with a timeout, a basic process-local request limiter, mandatory two-factor (TOTP) staff sign-in, an append-only staff audit log, per-account sign-in lockout, and an intrusion-detection alarm system (honeypots, threat scoring, temporary IP blocking, `security_events` audit rows and Slack/Teams alerts via `SECURITY_ALERT_WEBHOOK_URL`). The limiter is not shared between instances; use a shared production limiter before scaling public write endpoints.

Employer job orders use Paystack-hosted checkout. Set `PAYSTACK_SECRET_KEY` only in the backend environment. Configure the Paystack webhook at `/api/payments/paystack/webhook`; the default browser return URL is the first allowed frontend origin plus `/employers`.
