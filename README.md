# IMFORCE public site

React/TypeScript frontend with an Express API backed by Supabase. See [production readiness and remaining release gates](./PRODUCTION_READINESS.md) before deployment.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and set the Supabase project URL and keys. Keep the service-role key server-side and out of version control.
2. In `backend`, run `npm ci` then `npm run dev`.
3. In `frontend`, run `npm ci` then `npm run dev`.
4. Set `VITE_API_BASE_URL` in the frontend environment only when the API is not served from the same origin; it must be the API origin, without a trailing slash.

The Vite development server defaults to port 5173 and the API defaults to 3001. Production must use an HTTPS `FRONTEND_ORIGIN`, a secret manager for backend credentials, HTTPS end to end, and verified proxy settings.

## Available frontend commands

- `npm run dev` starts Vite.
- `npm run lint` runs ESLint.
- `npm run build` type-checks and creates the production bundle.

## API

The API uses Helmet, CORS origin allowlisting, bounded JSON bodies, request validation, Supabase calls with a timeout, and a basic process-local request limiter. The limiter is not shared between instances; use a shared production limiter before scaling public write endpoints.

Employer job orders use Paystack-hosted checkout. Set `PAYSTACK_SECRET_KEY` only in the backend environment. Configure the Paystack webhook at `/api/payments/paystack/webhook`; the default browser return URL is the first allowed frontend origin plus `/employers`.
