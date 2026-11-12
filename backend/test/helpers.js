'use strict'
// Test harness: boots the real Express app on an ephemeral port with fake
// Supabase, Paystack and alert-webhook back ends (global fetch is intercepted).
const crypto = require('node:crypto')

const SUPABASE = 'https://supabase.test'
const PAYSTACK_SECRET = 'sk_test_fake_secret_for_tests'
const ALERT_URL = 'https://alerts.test/hook'
const STAFF_ID = '11111111-1111-4111-8111-111111111111'
const OUTSIDER_ID = '22222222-2222-4222-8222-222222222222'
const VALID_TOKEN = 'aaa.bbb.staff'
const OUTSIDER_TOKEN = 'aaa.bbb.outsider'

Object.assign(process.env, {
  NODE_ENV: 'test',
  SUPABASE_URL: SUPABASE,
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  PAYSTACK_SECRET_KEY: PAYSTACK_SECRET,
  FRONTEND_ORIGIN: 'http://localhost:5173',
  SECURITY_ALERT_WEBHOOK_URL: ALERT_URL,
  SECURITY_BLOCK_PRIVATE_IPS: 'true',
  TRUST_PROXY_HOPS: '1',
})

const realFetch = globalThis.fetch
const state = {
  calls: [], alerts: [], events: [], contacts: [], employers: [], vacancies: [], audit: [],
  paystackTransaction: null,
}

function json(body, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  const method = init.method || 'GET'
  const body = init.body ? JSON.parse(init.body) : undefined
  const auth = init.headers?.Authorization || ''
  if (url.origin === SUPABASE) {
    state.calls.push({ method, path: url.pathname, search: url.search, body, auth })
    if (url.pathname === '/auth/v1/token') {
      if (['staff@imforce.co.za', 'second.staff@imforce.co.za'].includes(body.email) && body.password === 'correct-horse') return json({ access_token: VALID_TOKEN, expires_in: 3600, user: { id: STAFF_ID, email: body.email } })
      if (body.email === 'outsider@example.com' && body.password === 'correct-horse') return json({ access_token: OUTSIDER_TOKEN, expires_in: 3600, user: { id: OUTSIDER_ID, email: body.email } })
      return json({ message: 'Invalid login credentials' }, 400)
    }
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
    if (url.pathname === '/auth/v1/user') {
      if (auth === `Bearer ${VALID_TOKEN}`) return json({ id: STAFF_ID, email: 'staff@imforce.co.za' })
      if (auth === `Bearer ${OUTSIDER_TOKEN}`) return json({ id: OUTSIDER_ID, email: 'outsider@example.com' })
      return json({ message: 'invalid JWT' }, 401)
    }
    if (url.pathname === '/rest/v1/staff_profiles') return json(url.search.includes(STAFF_ID) ? [{ user_id: STAFF_ID }] : [])
    if (url.pathname === '/rest/v1/security_events') { state.events.push(body); return json(undefined, 201) }
    if (url.pathname === '/rest/v1/staff_audit_log') {
      if (method === 'POST') { state.audit.push(body); return json(undefined, 201) }
      return json([...state.audit].reverse())
    }
    if (url.pathname === '/rest/v1/contact_inquiries') {
      if (method === 'POST') { state.contacts.push(body); return json(undefined, 201) }
      return json(state.contacts)
    }
    if (url.pathname === '/rest/v1/employer_inquiries') {
      if (method === 'POST') { const row = { id: crypto.randomUUID(), details: body.details }; state.employers.push(row); return json([row], 201) }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id').slice(3)
        const row = state.employers.find((item) => item.id === id)
        if (row) row.details = body.details
        return json(undefined, 204)
      }
      const ref = url.searchParams.get('details->>paymentReference')
      if (ref) return json(state.employers.filter((row) => `eq.${row.details.paymentReference}` === ref))
      return json(state.employers)
    }
    if (url.pathname === '/rest/v1/vacancies') {
      if (method === 'DELETE') {
        const id = url.searchParams.get('id').slice(3)
        const removed = state.vacancies.filter((row) => row.id === id)
        state.vacancies = state.vacancies.filter((row) => row.id !== id)
        return json(removed)
      }
      if (method === 'POST') { const row = { id: crypto.randomUUID(), status: 'published', created_at: new Date().toISOString(), ...body }; state.vacancies.push(row); return json([row], 201) }
      const idFilter = url.searchParams.get('id')?.slice(3)
      if (method === 'PATCH') {
        const row = state.vacancies.find((item) => item.id === idFilter)
        if (!row) return json([])
        Object.assign(row, body)
        return json([row])
      }
      return json(idFilter ? state.vacancies.filter((item) => item.id === idFilter) : state.vacancies)
    }
    return json({ message: 'not mocked' }, 500)
  }
  if (url.origin === 'https://api.paystack.co') {
    state.calls.push({ method, path: url.pathname, body })
    if (url.pathname === '/transaction/initialize') {
      return json({ status: true, data: { authorization_url: state.checkoutUrl ?? 'https://checkout.paystack.com/abc123', reference: body.reference } })
    }
    if (url.pathname.startsWith('/transaction/verify/')) return json({ status: true, data: state.paystackTransaction })
  }
  if (url.href === ALERT_URL) { state.alerts.push(body); return new Response(null, { status: 200 }) }
  return realFetch(input, init)
}

const { app, security } = require('../server')
let server
let base

async function start() {
  if (server) return base
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
  base = `http://127.0.0.1:${server.address().port}`
  return base
}
function stop() { server?.close(); server = undefined }

let ipCounter = 10
const freshIp = () => `203.0.113.${ipCounter++}`

async function call(path, { method = 'GET', body, ip = freshIp(), headers = {}, raw } = {}) {
  const response = await realFetch(`${await start()}${path}`, {
    method,
    headers: { 'X-Forwarded-For': ip, ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: response.status, headers: response.headers, data }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function validJobOrder(overrides = {}) {
  const future = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
  return {
    legalName: 'Acme Holdings (Pty) Ltd', registrationNumber: '2020/123456/07', companyAddress: '1 Main Road, Cape Town',
    contactName: 'Thandi Mokoena', email: 'Hiring@Acme.co.za', phone: '+27 21 555 0100', billingContact: 'Accounts',
    billingAddress: '1 Main Road, Cape Town', jobTitle: 'Senior Accountant', jobLocation: 'Cape Town', numberOfHires: '2',
    employmentType: 'Permanent', workingHours: 'Mon-Fri 08:00-17:00', salary: 'ZAR 45 000 per month', closingDate: future,
    duties: 'Prepare monthly management accounts, reconciliations and VAT returns for the group.',
    requirements: 'Strong IFRS knowledge and Excel modelling skills.', qualifications: 'BCom Accounting, 5 years experience',
    authorizedContact: true, ...overrides,
  }
}

function signLegacy(rawBody) {
  return crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex')
}

module.exports = { call, start, stop, state, security, settle, freshIp, validJobOrder, signLegacy, VALID_TOKEN, OUTSIDER_TOKEN, STAFF_ID }
