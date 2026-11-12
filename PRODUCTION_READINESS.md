# Production readiness

This repository contains the public React site and a small Express API. Paystack checkout is implemented, but the full employer portal described in the developer scope is not. Do not treat a successful frontend build as acceptance for account onboarding, client dashboards, or candidate data processing.

## Changes in this readiness pass

- The home page now starts with the permanent-recruitment proposition and lets candidates search by role/keyword and location before opening the careers listings.
- Vacancy details send candidates to that vacancy's configured HTTPS application URL. When a link is absent, the page explains the state and offers a contact route instead of showing a nonfunctional sign-in link.
- External Google Fonts were removed so the site does not make an unneeded third-party request or depend on that service to render.
- The API now applies separate in-memory request limits for login, public writes, staff routes, and general reads; emits `Retry-After`; expires old buckets; times out Supabase requests; and refuses insecure or missing frontend origins in production.
- Employer checkout now initializes Paystack transactions server-side, stores the job order and pending payment reference, verifies amount/currency/status against Paystack, and supports signed callback/webhook confirmation.
- `backend/.env.example` documents the server configuration without containing credentials.
- A GitHub Actions workflow now runs locked installs, high-severity npm dependency audits, frontend lint/build, and backend syntax validation on pushes and pull requests.
- Production API startup now fails closed when the frontend origin or required Supabase credentials are missing or insecure.

## QA and secure-SDLC review (November 2026)

See [docs/QA_SECURITY_REVIEW.md](./docs/QA_SECURITY_REVIEW.md) for the full findings, evidence and go-live checklist. In summary: a ReDoS in email validation, the exposure of client names to the anon key, the public scope document, and missing per-account brute-force protection were fixed. Session revocation, idle timeout, a production CSP and security headers, restored database migrations (plus `004_security_hardening.sql`), an intrusion-detection alarm system, 33 API security tests, a secret scan and CodeQL in CI were added. Round 2 (12 November 2026) added mandatory staff two-factor sign-in, an append-only staff audit log (migration 005), a POPIA privacy notice, dead-code removal, WCAG 2.1 AA accessibility fixes, graceful shutdown and Dependabot. The remaining go-live steps are configuration and sign-off: run migrations 004 and 005, confirm Supabase MFA is enabled, have IMFORCE review the privacy notice, configure the alert webhook, hosting headers and proxy hops, enable repository protections, test Paystack end to end, and complete an independent penetration test.

## Release blockers from the approved scope

These require IMFORCE decisions, credentials, infrastructure, or the connected systems and are not safely implementable from this repository alone:

- Employer identity and email OTP verification, durable client accounts, agreement versioning and signatures, activation-fee business approvals/credits/refunds, and Talent One synchronization. Paystack checkout replaces the earlier PayPod/NetCash proposal, subject to IMFORCE approval of this scope change.
- Human advert approval with reviewer/version/reason audit records; client job tracking, candidate submissions, interview feedback, and Talent One synchronization.
- Nexora AI API contract and vacancy destinations, plus the documented and tested outage fallback queue.
- Supabase schema and row-level security policy review, data retention/privacy decisions, migration/reconciliation, backup and restore evidence, incident response, and production secret provisioning.
- Independent security review and penetration testing, remediation and retest, and written IMFORCE release approval.
- Production hosting/reverse-proxy topology and a shared rate-limit store. The current API limiter is process-local and is suitable only as a basic single-instance safeguard; it is not an adequate distributed production abuse control.

## Required deployment configuration

- Set `NODE_ENV=production`, `FRONTEND_ORIGIN` to the exact HTTPS site origin(s), Supabase URL, anon key, service-role key, and `PAYSTACK_SECRET_KEY` in the host's secret manager. Never set either server-only secret in a `VITE_` variable.
- Configure Paystack's webhook URL as `https://<api-host>/api/payments/paystack/webhook`. Add `PAYSTACK_WEBHOOK_SECRET` when using the timestamped `Paystack-Signature` signing mode; legacy `x-paystack-signature` uses the API secret. Set `PAYSTACK_CALLBACK_URL` only when the callback is not the default allowed origin `/employers` URL.
- Add the Paystack secret key to `backend/.env` for local testing (or the host secret manager in production); this workspace's `.env` currently has no `PAYSTACK_SECRET_KEY`. Do not paste API secrets into chat or put them in a `VITE_` variable. Complete a Paystack test-mode payment and webhook check before enabling a live key.
- Enable customer transaction receipts and set the support email in Paystack Dashboard settings so the proof-of-payment message shown after checkout is delivered.
- Set `TRUST_PROXY_HOPS` only to the verified number of trusted proxies in front of Express. Leave it unset for direct access.
- Use HTTPS, restrictive database policies, least-privilege staff provisioning with MFA, database backups with restore drills, monitoring/alerting, and a shared rate limiter before exposing public submissions at scale.
- Review vacancy application URLs and only publish approved listings with the correct matching Nexora AI destination.
- Add repository branch protection and reviewed pull requests, automated secret scans, role-access tests, audit logging, and release security sign-off before accepting the secure-SDLC requirements. Dependency auditing is now part of CI.
- The workflow does not enable repository-level branch protection or GitHub secret scanning; an IMFORCE repository owner must configure those controls in GitHub settings.
- The current npm audit database reported 10 moderate findings in the frontend development lint/parser dependency chain and no high-severity findings; the backend audit reported no vulnerabilities. Review and resolve the moderate tooling advisories as compatible patched releases become available.
