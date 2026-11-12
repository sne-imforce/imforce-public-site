# QA and Security Review — IMFORCE Public Site

| | |
|---|---|
| **Review dates** | 11 November 2026 (round 1); 12 November 2026 (round 2: production readiness, dead code, UI) |
| **Branch** | `testingClaudeCode` |
| **Scope** | Whole repository: React frontend, Express API, Supabase schema, CI pipeline, static assets |
| **Method** | Manual code review against OWASP Top 10 / ASVS L1, abuse-case analysis ("what can an attacker do, and what can a careless or dishonest user do?"), UX and accessibility review, dead-code analysis, plus automated tests at five layers (API, database, browser, accessibility, CI) |
| **Verdict** | ✅ **Code is production-ready.** Every code-level release blocker is fixed and tested. ⏳ **Go-live is conditional** on the deployment, configuration and sign-off steps in §6, which need IMFORCE access or an independent tester and cannot be done from the repository. |

---

## 1. Executive summary

The codebase was in better shape than most at this stage. Payments were already verified server-side, job-order fields were whitelisted, webhook signatures were compared in constant time, and no secrets have ever been committed. The review still found **4 high**, **6 medium** and **10 low/informational** issues. All of them are **fixed and covered by automated tests**.

The most serious:

1. **One request could freeze the server** (ReDoS). The contact form checked the email with a backtracking regular expression *before* checking its length. A single 30 KB request blocked the Node.js event loop for **1.4 seconds**, so a handful of requests per second from a few addresses would take the API down for everyone.
2. **Anyone could list IMFORCE's clients.** The database granted the public `anon` role read access to the whole `vacancies` table. The API hid `client_name`, but anyone holding the anon key could query Supabase directly and read it.
3. **The internal developer scope document was public.** It was in `frontend/public/`, so it was downloadable from the live site root. It contains fee rules, internal workflows, partner systems and security requirements.
4. **Unlimited password guessing across many IPs.** Brute-force protection counted attempts per IP address only. An attacker spreading guesses across many IPs (credential stuffing) was never stopped.

In addition, an **intrusion-detection "alarm system"** was added, as requested. It covers trap routes, a robots.txt decoy, hidden form traps, threat scoring, automatic temporary blocking, a database audit trail and Slack/Teams alerts (see §4).

### Round 2 (12 November 2026): production readiness

Round 2 closed the two remaining high-severity open items (no privacy notice, password-only staff accounts) and the main medium one (no record of staff actions). It also removed dead code and fixed the UI and accessibility problems found in a page-by-page review:

- **Two-factor sign-in for staff** (authenticator app, TOTP) is enforced on every staff route. A stolen password alone no longer gives access to enquiries.
- **Append-only staff audit log.** Every sign-in, sign-out, enquiry view and vacancy change is recorded with who, when, from where and what changed. Tests prove the history cannot be edited or deleted, even by the database owner.
- **POPIA privacy notice** at `/privacy`, linked from the footer and both forms.
- **Dead code:** 5 empty page files, an unused dependency, a template asset, 134 unused CSS rules and unused exports removed. The CSS shrank by 14%, and the site was verified **pixel-identical** on 20 page and device screenshots.
- **Accessibility:** 0 axe-core violations (WCAG 2.1 AA) on every page, desktop and mobile. 120+ low-contrast labels were fixed.
- **Operations:** graceful shutdown, access log, crash logging, Dependabot.

Browser testing of the new sign-in also caught **three defects in the new code before release**. The most serious was that the password typed on step 1 reappeared, readable, in the code field on step 2. All three are fixed and covered by E2E checks (R2-09 to R2-11 below).

### Round 3 (12 November 2026): staff workspace

`/admin` was restructured into an **Inventory** hub with two subscreens, **Job posts** and **Audit log**. A shared tab bar and the Home and Sign out buttons appear on all three. Every list is now a table with search, sortable columns and filters, showing 10 rows per page with ‹ › buttons, so long lists never clutter the screen. On phones each row becomes a labelled card. The accessibility audit found one heading-order issue on the new Job posts screen, which was fixed before release. All admin URLs (not only `/admin` itself) are now `noindex`.

### Round 4 (12 November 2026): username sign-in

Staff now sign in with a **username** instead of their email, and the workspace greets them by name. The design keeps security intact:

- The API resolves the username to the account and authenticates with Supabase using the email on file.
- Unknown usernames get the same message *and* the same minimum response time (600 ms) as a wrong password, so usernames can't be harvested by measuring response times.
- An email typed into the username box is refused.
- Lockout applies per account.
- Passwords are stored only as Supabase's bcrypt hash and are never stored or logged in readable form.

`npm run staff:create` adds an agent with name, username, email and a hidden password, and rolls back on failure. Testing found and fixed a defect in that tool before release: with piped input it exited *successfully* without creating anything. A full-rule accessibility audit also found a long-standing label mismatch on the footer logo link (WCAG 2.5.3, all pages), which is now fixed.

---

## 2. Findings and remediation

Severity uses CVSS-style judgement: **High** means direct data exposure or service outage, **Medium** means a meaningful weakness that needs another condition to exploit, **Low/Info** means hardening or quality.

### Fixed in this review

| ID | Sev. | Finding | Fix | Evidence |
|---|---|---|---|---|
| QA-01 | **High** | ReDoS: the email regex ran on unbounded input before the length check (1.4 s per request at 30 KB) | Linear-time `isEmail()`; length checks run first; both endpoints updated; detector regexes bounded | `api.test.js` "email validation is linear time" (< 300 ms on 25–30 KB inputs) |
| QA-02 | **High** | `client_name` readable with the anon key directly from Supabase | Migration 004: column-level grants exclude `client_name`; the API selects explicit columns | `qa/db-permissions.sh` "anon cannot read client_name" / "select *" |
| QA-03 | **High** | Internal scope `.docx` served publicly from `frontend/public/` | Moved to `docs/reference/` (not deployed) | `dist/` no longer contains it. **Action:** delete it from the current live host and request search-engine removal if it was indexed. |
| QA-04 | **High** | No per-account lockout (credential stuffing across IPs) | 5 failures → 15-minute account lock, regardless of IP; alarm raised | "account locks after 5 failures even when attempts come from different IPs" |
| QA-05 | Medium | Account enumeration: valid non-staff credentials got a different message (403) from a wrong password (401), and the issued session was left active | Identical 401 message; the session is revoked; high-severity alarm | "non-staff accounts get the same answer as a wrong password" |
| QA-06 | Medium | Sign-out only cleared the browser, so a copied token stayed valid for about an hour. No idle timeout and no expiry handling. | `POST /api/staff/logout` revokes server-side; 15-minute idle sign-out; expiry timer; automatic sign-out on any 401 | API test "sign-out revokes the session"; E2E "sign out calls server logout", "expired token is not reused" |
| QA-07 | Medium | No security monitoring or alerting (OWASP A09) | `security.js` alarm system (§4) | `security.test.js` (13 tests) |
| QA-08 | Medium | Website served with no CSP, clickjacking or HSTS headers | Strict CSP injected into the production build; `public/_headers` for frame-ancestors, HSTS, nosniff and Permissions-Policy | E2E: 0 CSP violations on 9 routes × 2 devices |
| QA-09 | Medium | Database migrations had been deleted from the repo, so RLS could not be reviewed or reproduced | 001–003 restored unchanged; 004 adds hardening | Migrations applied twice on PostgreSQL 16 (re-run safe) |
| QA-10 | Medium | Expired vacancies were hidden only by the API, not by the database | RLS policy also filters `closing_date` | "anon sees only open published roles" |
| QA-11 | Low | The bot-trap field was named `website`, which browser autofill may fill, so a genuine enquiry could be **silently discarded** | Renamed to `extraNotesHp` on both forms (the old name is still honoured); added to the job-order form | E2E hit-test: trap not visible, not clickable, not tabbable |
| QA-12 | Low | Oversized body returned 500 instead of 413; unknown `/api/*` routes returned an Express HTML page | JSON 413 and 404 | "oversized bodies…413", "unknown API route returns JSON 404" |
| QA-13 | Low | Non-JSON content types were accepted | 415 for POST and PUT that aren't JSON | "non-JSON writes are rejected with 415" |
| QA-14 | Low | `:id` not validated on staff update and delete; deleting a missing vacancy reported success | UUID check (with alarm); 404 when nothing was deleted | "reject non-UUID ids and report missing records" |
| QA-15 | Low | Staff API responses with personal information could be cached by browsers or proxies | `Cache-Control: no-store` on `/api/staff/*` | "staff routes require a valid staff session" |
| QA-16 | Low | `javascript:` apply links were blocked only server-side | `safeHttpsUrl()` on the frontend; DB CHECK constraint | E2E "careers never renders javascript: apply links"; DB "javascript: application URL rejected" |
| QA-17 | Low (UX) | Network errors told visitors to "Start the backend server and check VITE_API_BASE_URL" | Plain-language message | Code review |
| QA-18 | Low (UX) | The staff login button had no busy state, so double-clicks sent duplicate logins and used up the 5-per-minute limit | Disabled with "Signing in…" while the request runs | E2E "double-click sends only one login request" |
| QA-19 | Low (UX) | The staff dashboard showed contact enquiries without the sender's name, phone or enquiry type | Fields added; internal payment fields hidden | E2E "enquiry shows name/phone/type" |
| QA-20 | Info | Leftover Formspree `_subject` hidden field; no tests, secret scanning or SAST in CI | Removed; CI now runs the backend tests, a secret-pattern scan and CodeQL | `.github/workflows/ci.yml` |

### Fixed in round 2

| ID | Sev. | Finding | Fix | Evidence |
|---|---|---|---|---|
| R2-01 | **High** | (was OPEN-2) Staff accounts protected by password only | Mandatory TOTP MFA via Supabase Auth; AAL2 enforced on every staff route; code step shares the sign-in rate limit and account lockout | `mfa.test.js` (8 tests); E2E MFA checks |
| R2-02 | **High** | (was OPEN-1) No privacy notice although personal information is collected | `/privacy` page based on what the code actually collects; linked from the footer and both forms | E2E and axe on `/privacy` |
| R2-03 | Medium | (was OPEN-4, partly) No record of staff actions | Append-only `staff_audit_log` (migration 005) and dashboard panel | 2 API tests; 9 DB checks |
| R2-04 | Medium | 120+ text elements failed WCAG AA contrast (3.8–4.2:1) | `--color-accent-text` #296fb0 (≥ 4.7:1) for text only | axe: 0 violations |
| R2-05 | Medium | A stray, keyboard-focusable "Close navigation menu" button showed above the header on desktop | Hidden outside the mobile layout; removed from the tab order (Escape still closes the menu) | Screenshot and axe |
| R2-06 | Low | Careers list declared `role="list"` but contained buttons (broken for screen readers) | Valid markup; `aria-pressed` marks the selected vacancy | axe |
| R2-07 | Low | Non-numeric salaries displayed as "ZAR Market Related Salary" | Currency label only shown for amounts | Screenshot |
| R2-08 | Low (UX) | Staff enquiry details were unstyled, used US date format, and didn't show payment status | Labelled grid, SA date format, contact/job-order and Paid/Awaiting payment badges, safe reply link | Screenshot |
| R2-09 | **High** (new code) | Step 2 of sign-in showed the step-1 password in plain text in the code field (React reused the input element) | Separate keyed forms | E2E "password is not carried into the code field" |
| R2-10 | Medium (new code) | A wrong authenticator code sent the user back to the password step | The session-expiry handler now ignores sign-in steps; only an expired ticket restarts | E2E "wrong code keeps the user on the code step" |
| R2-11 | Low (new code) | The code field wasn't focused automatically | Focus on step change; `autocomplete="one-time-code"` | E2E |
| R2-12 | Low | Dead code: empty page files, unused `@reduxjs/toolkit`, Vite template `icons.svg`, 134 unused CSS rules, unused exports; the README referenced a missing `frontend/.env.example` | Removed or added | knip clean; build pixel-identical |
| R2-13 | Low (ops) | No graceful shutdown, access log or automated dependency updates | SIGTERM handling, JSON access log, `unhandledRejection` logging, Dependabot | Live start/stop test |

### Confirmed secure (no change needed)

- Payment trust: a payment counts as paid only after Paystack's verify API confirms the reference, status, **exact amount**, currency **and** email. Underpayment is rejected (tested).
- Mass assignment: a client cannot send `paymentStatus: "paid"` (tested).
- Webhook HMAC-SHA512 is checked with `timingSafeEqual` and a 5-minute replay window. Forged and unsigned webhooks are rejected (tested).
- The checkout redirect is accepted only for `https://checkout.paystack.com`, on both the server and the client (tested).
- No `dangerouslySetInnerHTML` or `eval`. Stored XSS in enquiries renders as harmless text (E2E tested).
- Git history scanned: **no real secrets ever committed** (only placeholders, plus a public Formspree form ID in old commits).
- The staff token uses `sessionStorage`, not `localStorage`. External links use `rel="noopener noreferrer"`. Saved filters and drafts are validated before use.

### Open: requires IMFORCE decisions or infrastructure

| ID | Sev. | Item | Recommendation |
|---|---|---|---|
| OPEN-1 | Info | ~~No privacy notice~~ Fixed in R2-02. The text must still be reviewed by whoever handles IMFORCE's legal and POPIA matters (contact email, retention periods, whether providers process data outside South Africa). | IMFORCE review |
| OPEN-2 | — | ~~Password-only staff accounts~~ Fixed in R2-01 | — |
| OPEN-3 | Medium | Rate limiter, block list and lockouts are in memory: they reset on restart and are per instance | Run a single API instance for now; add Redis or a DB store and an edge WAF before scaling |
| OPEN-4 | Low | ~~No audit log~~ Fixed in R2-03. Still no recruiter-versus-admin roles: any staff member can delete any vacancy (now fully audited). | Add roles if IMFORCE wants to restrict deletes |
| OPEN-5 | Medium | Repository controls cannot be set from code | Owner: enable branch protection, required reviews and CI, secret scanning and push protection, Dependabot alerts (the config file is added), and 2FA |
| OPEN-6 | Medium | Job-order and contact forms can still be spammed at 6 per minute per IP (orders saved before payment) | Monitor `security_events`; add Cloudflare Turnstile if abuse appears |
| OPEN-7 | Medium | Supabase public sign-up may be enabled. That is harmless for access (staff need `staff_profiles`) but lets anyone create auth users. | Disable "Allow new users to sign up" in Supabase Auth |
| OPEN-8 | Low | 10 moderate npm advisories in frontend **dev** tooling (ESLint/minimatch chain); none ship to users | Update when compatible patches are released |
| OPEN-12 | Low | Trade-off of QA-04: someone who knows a staff email can deliberately lock that account for 15 minutes | Accepted (industry standard). The `staff-account-locked` alarm fires when it happens; MFA (OPEN-2) makes guessing pointless. |
| OPEN-9 | Low | ~~Unused dependency and empty pages~~ Fixed in R2-12. Folder names with spaces remain (they work, but are awkward for scripts). | Rename in a separate PR |
| OPEN-10 | Info | Paystack replaces PayPod/NetCash from the scope | Needs written IMFORCE approval |
| OPEN-11 | Info | Scope features not built (employer accounts, OTP, e-signature, approval workflow, integrations) | See `PRODUCTION_READINESS.md` |

---

## 3. UX review (balancing ease of use and security)

The goal was **no extra friction for genuine users**, with the friction going to attackers instead.

| Principle | How it is applied |
|---|---|
| Invisible security for customers | No CAPTCHA. Bot traps are hidden fields that people never see. Detection flags suspicious content without rejecting a single odd message. |
| Never punish the innocent | Private, proxy and allowlisted IPs are never auto-blocked; blocks expire after 30 minutes; the blocked message is polite and says to contact IMFORCE. |
| Clear, human errors | Field-level messages with examples ("for example name@company.co.za"); no technical jargon; the job-order form links each error to its field. |
| Prevent mistakes | Busy states stop double submission; `maxLength` matches the server limits so users can't type more than will be accepted; the job-order draft autosaves in the tab. |
| Visible deterrence where it matters | The staff login says "Sign-in attempts are monitored and logged." Public pages show nothing of the kind. |
| Safe defaults for staff | 15-minute idle sign-out; a clear message explains why ("You were signed out after 15 minutes of inactivity"). |

Responsive check: all 10 routes on desktop (1366 px) and iPhone 13 have **no horizontal overflow and no JavaScript errors** (E2E), and **0 accessibility violations** (axe-core, WCAG 2.1 AA).

Two-step sign-in was designed to be quick: the code field is focused automatically, phones can autofill the code (`one-time-code`), spaces in the code are accepted, a wrong code keeps you on the code step with a plain explanation, and "Use a different account" goes back.

**UX suggestions (not implemented, need content or design decisions):** show a "what happens next" timeline after payment; on the careers page, show a "clear filters" chip when no roles match.

---

## 4. Alarm system summary

Full details are in [PROJECT_DOCUMENTATION.md §11](./PROJECT_DOCUMENTATION.md#11-intrusion-detection-and-alarms).

| Layer | Trap or sensor | Response |
|---|---|---|
| Trip-wire | Scanner path patterns (`/.env`, `/wp-admin`, `/.git`, `*.php` …) and decoy APIs (`/api/admin`, `/api/users` …) | Fake 404, **instant block**, alert |
| Bait | `/api/internal/backup` advertised only in `robots.txt` | Same as above |
| Hidden field | `extraNotesHp` on the contact and job-order forms | Bot silently ignored or rejected, logged |
| Sensors | Attack signatures, failed logins, account lock, forged webhooks, bad tokens, rate-limit hits | Threat points; 100 points → 30-minute block |
| Outputs | JSON security log, `security_events` table, Slack/Teams webhook (throttled) | |

---

## 5. Test evidence

All results were reproduced in the final QA pass. Commands:

| Layer | Command | Result |
|---|---|---|
| API and security unit/integration | `cd backend && npm test` | **51 / 51 passed** (including 8 MFA, 2 audit-log, 4 username sign-in and 5 staff-creation tool tests) |
| Database permissions and migrations | `QA_SCRATCH_DB=yes PG…=… ./qa/db-permissions.sh` (scratch PostgreSQL 16) | **37 / 37 passed**; migrations 001–006 re-run safely; 006 username backfill (duplicates, short and odd email prefixes) |
| Browser E2E (Chromium, desktop and mobile) | `node qa/e2e-smoke.cjs` against `vite preview` | **75 / 75 passed** |
| Staff workspace E2E (27 job posts, 23 enquiries, 60 audit entries) | `node qa/e2e-admin.cjs` against `vite preview` | **45 / 45 passed**: agent name in header, tabs, paging, search, sort, filters, expand, edit, delete confirmation modal, deep links, phone card layout |
| Accessibility | axe-core 4 in Playwright, WCAG 2.1 A/AA and best practices, 10 public routes and 3 signed-in admin screens × desktop and mobile | **0 violations** |
| Visual regression (dead-CSS removal) | Full-page screenshots before and after, pixel diff, 20 page/device combinations | **20 / 20 identical** |
| Live server smoke | `npm start`: health, honeypot alarm, access log, SIGTERM | Pass |
| Frontend static checks | `npm run lint && npm run build` | Pass |
| Dependency audit | `npm audit --audit-level=high` (both packages) | Pass. Backend 0 vulnerabilities; frontend 10 moderate (dev only). |
| Secret scan | CI pattern scan, including untracked files, with a planted-key positive control | Clean; control detected |

Test design notes: the API suite mocks Supabase, Paystack and the alert webhook at the `fetch` layer, so it runs offline in CI. Each test uses its own client IP (through a trusted proxy hop) so rate limits and blocks don't interfere between tests.

---

## 6. Release conditions (go-live checklist)

- [ ] Run `backend/migrations/004_security_hardening.sql`, `005_staff_audit_log.sql` and `006_staff_usernames.sql` on Supabase, then check the generated usernames (`select username, display_name from staff_profiles`) and tell each agent their username. The API works without them, but **client names stay exposed to the anon key until 004 runs** (QA-02), and the security and audit trails need both.
- [ ] Check that MFA (TOTP) is enabled in Supabase (**Authentication → Multi-Factor**) and that `STAFF_MFA_REQUIRED` is **not** set to `false`. Each staff member then sets up their authenticator on their next sign-in. Do a test sign-in on staging first.
- [ ] Delete the old scope `.docx` from the live web host (QA-03).
- [ ] Configure the security headers on the chosen host (`public/_headers` or an equivalent).
- [ ] Set `SECURITY_ALERT_WEBHOOK_URL` to a monitored Slack or Teams channel and trigger a test (`curl https://<api>/api/admin` from a non-allowlisted network should produce an alert).
- [ ] Set `TRUST_PROXY_HOPS` correctly (check that `security_events.ip_address` shows real client IPs, not the proxy's).
- [ ] Have the privacy notice reviewed by IMFORCE (OPEN-1). Repository protections (OPEN-5). Disable public sign-up in Supabase (OPEN-7).
- [ ] Paystack test-mode payment and webhook verified end to end, then switch to live keys.
- [ ] Independent penetration test, remediation, retest, and **written IMFORCE approval** (scope §10).
