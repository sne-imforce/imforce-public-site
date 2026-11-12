'use strict'
/*
 * OFFLINE MODE (temporary, for local testing only).
 *
 * Runs the real API with an in-memory stand-in for Supabase and Paystack (the
 * same fakes the test suite uses), so the website and staff workspace work
 * without internet or a Supabase project. Data is saved to dev/.offline-data.json
 * so it survives restarts; delete that file to start fresh.
 *
 *   cd backend && npm run offline        (API on http://localhost:3001)
 *   cd frontend && npm run dev:offline     (website on http://localhost:5173)
 *
 * Staff sign-in: username "staff", password "correct-horse" (Thandi Mokoena)
 *            or: username "second.staff", password "correct-horse" (Sipho Dlamini)
 * Emails are printed in this terminal instead of being sent.
 * Paystack is simulated: after "Checkout", open the link printed here to
 * pretend the payment succeeded.
 *
 * Never use this in production: it refuses to start when NODE_ENV=production.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

if (process.env.NODE_ENV === 'production') {
  console.error('Offline mode is for local testing only and will not run with NODE_ENV=production.')
  process.exit(1)
}
const port = Number(process.env.PORT || 3001)
const site = (process.env.OFFLINE_SITE_URL || 'http://localhost:5173').replace(/\/$/, '')
// Settings the fake back end reads (must be set before it loads).
Object.assign(process.env, { SECURITY_BLOCK_PRIVATE_IPS: 'false', TRUST_PROXY_HOPS: '', PUBLIC_SITE_URL: site, STAFF_MFA_REQUIRED: 'false', SMTP_HOST: 'log' })

const { state } = require('../test/helpers')
const { app } = require('../server')

// --- Saved data ----------------------------------------------------------
const dataFile = path.join(__dirname, '.offline-data.json')
const saved = ['contacts', 'employers', 'vacancies', 'audit', 'changeRequests', 'paymentLinks', 'events']
const iso = (days) => new Date(Date.now() + days * 86_400_000).toISOString()
function seed() {
  const details = (overrides) => ({
    legalName: 'Acme Holdings (Pty) Ltd', tradingName: 'Acme', registrationNumber: '2020/123456/07', vatNumber: '', companyAddress: '1 Main Road, Durban',
    contactName: 'Thandi Mokoena', email: 'hr@acme.example', phone: '+27 31 555 0100', billingContact: 'Accounts', billingAddress: '1 Main Road, Durban',
    jobTitle: 'Financial Manager', jobLocation: 'Durban', numberOfHires: '1', employmentType: 'Permanent', workingHours: 'Mon-Fri 08:00-17:00',
    salary: 'ZAR 55 000 per month', closingDate: iso(21).slice(0, 10), duties: 'Lead the finance team and close the books every month on time.',
    requirements: 'IFRS knowledge and advanced Excel skills', qualifications: 'BCom Accounting, 5 years experience', authorizedContact: true,
    paymentAmountMinor: 49_900, paymentCurrency: 'ZAR', ...overrides,
  })
  const paid = (ref) => ({ paymentStatus: 'paid', paymentReference: ref, paymentReferences: [ref], paymentPaidAt: iso(-0.2), paymentChannel: 'card', paystackTransactionId: '1' })
  const ref = () => `IMF-${crypto.randomUUID()}`
  state.employers.push(
    { id: crypto.randomUUID(), created_at: iso(-0.3), review_status: 'pending', details: details(paid(ref())) },
    { id: crypto.randomUUID(), created_at: iso(-3), review_status: 'pending', details: details({ legalName: 'Gamma Logistics', email: 'jobs@gamma.example', jobTitle: 'Dispatcher', paymentStatus: 'pending', paymentReference: ref() }) },
  )
  state.vacancies.push(
    { id: crypto.randomUUID(), status: 'published', created_at: iso(-5), client_name: 'Beta Foods', title: 'Payroll Clerk', location: 'Pietermaritzburg', region: 'KwaZulu-Natal', industry: 'Finance', category: 'Finance', employment_type: 'Permanent', summary: 'Run the monthly payroll for 300 staff.', responsibilities: ['Payroll', 'Leave records'], closing_date: iso(14).slice(0, 10), is_urgent: true },
    { id: crypto.randomUUID(), status: 'published', created_at: iso(-2), client_name: 'Delta Hotels', title: 'Front Office Manager', location: 'Durban', region: 'KwaZulu-Natal', industry: 'Hospitality', category: 'Hospitality', employment_type: 'Permanent', summary: 'Lead the front office team.', responsibilities: ['Guest service', 'Rosters'], closing_date: iso(30).slice(0, 10), is_urgent: false },
  )
  state.contacts.push({ id: crypto.randomUUID(), created_at: iso(-1), name: 'Lerato Nkosi', email: 'lerato@example.com', phone: '', enquiry_type: 'Job opportunities', subject: 'CV submission', message: 'Hello, I would like to register for accounting roles.' })
}
try {
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
  for (const key of saved) if (Array.isArray(data[key])) state[key] = data[key]
  console.log(`Loaded saved offline data from ${dataFile}`)
} catch {
  seed()
  console.log('Started with sample data (2 job orders, 2 vacancies, 1 enquiry).')
}
let lastSaved = ''
const save = () => {
  const data = JSON.stringify(Object.fromEntries(saved.map((key) => [key, state[key]])))
  if (data !== lastSaved) { fs.writeFileSync(dataFile, data); lastSaved = data }
}
setInterval(save, 2000).unref()

// --- Simulated Paystack ----------------------------------------------------
const fakeFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  if (url.origin === 'https://api.paystack.co') {
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    if (url.pathname === '/transaction/initialize') {
      const { reference, email } = JSON.parse(init.body)
      console.log(`\n[paystack:offline] Checkout started for ${email}.\n  To simulate a successful payment, open: ${site}/employers?reference=${reference}\n  (The Paystack tab that opens will not load offline; just close it.)\n`)
      return json({ status: true, data: { authorization_url: `https://checkout.paystack.com/offline-${reference}`, reference } })
    }
    const verify = url.pathname.match(/^\/transaction\/verify\/(.+)$/)
    if (verify) {
      const reference = decodeURIComponent(verify[1])
      const order = state.employers.find((row) => row.details.paymentReference === reference || row.details.paymentReferences?.includes(reference))
      return json({ status: true, data: { status: 'success', reference, amount: 49_900, currency: 'ZAR', customer: { email: order?.details.email ?? '' }, id: Date.now(), paid_at: new Date().toISOString(), channel: 'card' } })
    }
  }
  return fakeFetch(input, init)
}

const server = app.listen(port, () => {
  console.log(`\nIMFORCE API running OFFLINE on http://localhost:${port} (no Supabase, no Paystack, no real emails).`)
  console.log(`Website: in another terminal run "cd frontend && npm run dev:offline", then open ${site}`)
  console.log('Staff sign-in at /admin: username "staff", password "correct-horse".\n')
})
const stop = () => { save(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref() }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
