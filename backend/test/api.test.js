'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { call, stop, state, settle, validJobOrder, signLegacy, VALID_TOKEN, OUTSIDER_TOKEN } = require('./helpers')
const { isEmail } = require('../server')

test.after(stop)

test('health check responds and hardening headers are present', async () => {
  const res = await call('/api/health')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('x-powered-by'), null)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(res.headers.get('strict-transport-security'))
  assert.ok(res.headers.get('content-security-policy'))
})

test('unknown API route returns JSON 404, not a stack trace or HTML', async () => {
  const res = await call('/api/does-not-exist')
  assert.equal(res.status, 404)
  assert.deepEqual(res.data, { error: 'Not found.' })
})

test('CORS does not allow arbitrary origins', async () => {
  const res = await call('/api/health', { headers: { Origin: 'https://evil.example' } })
  assert.equal(res.headers.get('access-control-allow-origin'), null)
  const ok = await call('/api/health', { headers: { Origin: 'http://localhost:5173' } })
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173')
})

test('non-JSON writes are rejected with 415', async () => {
  const res = await call('/api/contact', { method: 'POST', raw: 'name=x', headers: { 'Content-Type': 'text/plain' } })
  assert.equal(res.status, 415)
})

test('oversized bodies are rejected with 413, malformed JSON with 400', async () => {
  const big = await call('/api/contact', { method: 'POST', raw: JSON.stringify({ message: 'x'.repeat(40_000) }) })
  assert.equal(big.status, 413)
  const bad = await call('/api/contact', { method: 'POST', raw: '{"name":' })
  assert.equal(bad.status, 400)
})

test('email validation is linear time (ReDoS regression)', async () => {
  const evil = `a@${'.'.repeat(30_000)}@`
  const started = Date.now()
  assert.equal(isEmail(evil), false)
  const res = await call('/api/contact', { method: 'POST', body: { name: 'A', email: `a@${'.'.repeat(25_000)}@`, enquiryType: 'Other enquiry', subject: 's', message: 'm' } })
  assert.equal(res.status, 400)
  assert.ok(Date.now() - started < 300, `validation took ${Date.now() - started}ms`)
  for (const good of ['name@company.co.za', 'a.b+c@sub.example.com']) assert.equal(isEmail(good), true, good)
  for (const bad of ['plain', 'a@b', '@x.com', 'a@@x.com', 'a b@x.com', 'a@x..com', 'a@x.c']) assert.equal(isEmail(bad), false, bad)
})

test('contact form saves trimmed, normalized enquiries', async () => {
  const res = await call('/api/contact', { method: 'POST', body: { name: ' Lerato ', email: 'Lerato@Example.COM', enquiryType: 'Job opportunities', subject: 'Hello', message: 'I am looking for work.' } })
  assert.equal(res.status, 201)
  const saved = state.contacts.at(-1)
  assert.equal(saved.name, 'Lerato')
  assert.equal(saved.email, 'lerato@example.com')
})

test('contact form rejects unexpected enquiry types and non-string fields', async () => {
  assert.equal((await call('/api/contact', { method: 'POST', body: { name: 'A', email: 'a@b.co', enquiryType: 'Hack', subject: 's', message: 'm' } })).status, 400)
  assert.equal((await call('/api/contact', { method: 'POST', body: { name: ['A'], email: 'a@b.co', enquiryType: 'Other enquiry', subject: 's', message: 'm' } })).status, 400)
  assert.equal((await call('/api/contact', { method: 'POST', body: { name: 'A', email: 'a@b.co', enquiryType: 'Other enquiry', subject: 's', message: 'm', phone: { $ne: 1 } } })).status, 400)
})

test('vacancies endpoint hides confidential client names and expired roles', async () => {
  const yesterday = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
  state.vacancies.push(
    { id: 'v1', title: 'Open', client_name: 'Secret Client', status: 'published', responsibilities: [], created_at: new Date().toISOString() },
    { id: 'v2', title: 'Expired', client_name: 'Secret Client', status: 'published', closing_date: yesterday, responsibilities: [], created_at: new Date().toISOString() },
  )
  const res = await call('/api/vacancies')
  assert.equal(res.status, 200)
  assert.deepEqual(res.data.vacancies.map((item) => item.title), ['Open'])
  assert.equal(JSON.stringify(res.data).includes('Secret Client'), false)
  state.vacancies = []
})

test('staff routes require a valid staff session', async () => {
  assert.equal((await call('/api/staff/vacancies')).status, 401)
  assert.equal((await call('/api/staff/vacancies', { headers: { Authorization: 'Bearer not-a-jwt' } })).status, 401)
  assert.equal((await call('/api/staff/vacancies', { headers: { Authorization: 'Bearer x.y.expired' } })).status, 401)
  assert.equal((await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${OUTSIDER_TOKEN}` } })).status, 403)
  const ok = await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${VALID_TOKEN}` } })
  assert.equal(ok.status, 200)
  assert.equal(ok.headers.get('cache-control'), 'no-store')
})

test('staff vacancy routes reject non-UUID ids and report missing records', async () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
  assert.equal((await call('/api/staff/vacancies/1%20or%201=1', { method: 'DELETE', headers: auth })).status, 404)
  assert.equal((await call('/api/staff/vacancies/33333333-3333-4333-8333-333333333333', { method: 'DELETE', headers: auth })).status, 404)
})

test('staff can create a vacancy; unsafe application URLs are refused', async () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
  const vacancy = { clientName: 'Client', title: 'Clerk', location: 'Durban', region: 'KZN', category: 'Admin', employmentType: 'Permanent', summary: 'Admin role', responsibilities: ['Filing'] }
  for (const applicationUrl of ['javascript:alert(1)', 'http://insecure.example', 'https://user:pass@x.example', 'data:text/html,hi']) {
    const res = await call('/api/staff/vacancies', { method: 'POST', headers: auth, body: { ...vacancy, applicationUrl } })
    assert.equal(res.status, 400, applicationUrl)
  }
  const created = await call('/api/staff/vacancies', { method: 'POST', headers: auth, body: { ...vacancy, applicationUrl: 'https://apply.example/job/1', status: 'draft', id: 'attacker-chosen' } })
  assert.equal(created.status, 201)
  assert.notEqual(created.data.vacancy.id, 'attacker-chosen')
  const deleted = await call(`/api/staff/vacancies/${created.data.vacancy.id}`, { method: 'DELETE', headers: auth })
  assert.equal(deleted.status, 200)
})

test('staff sign-in succeeds with valid credentials and sign-out revokes the session', async () => {
  const res = await call('/api/staff/login', { method: 'POST', body: { email: 'Staff@IMFORCE.co.za ', password: 'correct-horse' } })
  assert.equal(res.status, 200)
  assert.equal(res.data.accessToken, VALID_TOKEN)
  const out = await call('/api/staff/logout', { method: 'POST', body: {}, headers: { Authorization: `Bearer ${VALID_TOKEN}` } })
  assert.equal(out.status, 200)
  assert.ok(state.calls.some((c) => c.path === '/auth/v1/logout' && c.auth === `Bearer ${VALID_TOKEN}`))
})

test('non-staff accounts get the same answer as a wrong password (no account enumeration)', async () => {
  const wrong = await call('/api/staff/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'guess' } })
  const outsider = await call('/api/staff/login', { method: 'POST', body: { email: 'outsider@example.com', password: 'correct-horse' } })
  assert.equal(wrong.status, 401)
  assert.equal(outsider.status, 401)
  assert.deepEqual(outsider.data, wrong.data)
  assert.ok(state.calls.some((c) => c.path === '/auth/v1/logout' && c.auth === `Bearer ${OUTSIDER_TOKEN}`), 'outsider session must be revoked')
})

test('account locks after 5 failures even when attempts come from different IPs', async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await call('/api/staff/login', { method: 'POST', body: { email: 'staff@imforce.co.za', password: `guess-${attempt}` } })
    assert.equal(res.status, 401)
  }
  const correctButLocked = await call('/api/staff/login', { method: 'POST', body: { email: 'staff@imforce.co.za', password: 'correct-horse' } })
  assert.equal(correctButLocked.status, 401)
  await settle()
  assert.ok(state.alerts.some((alert) => alert.event.type === 'staff-account-locked'))
})

test('employer checkout: validation, mass-assignment protection and happy path', async () => {
  const missing = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: { email: 'x' } } })
  assert.equal(missing.status, 400)
  assert.ok(Array.isArray(missing.data.errors))

  const forged = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: validJobOrder({ paymentStatus: 'paid' }) } })
  assert.equal(forged.status, 400, 'client must not be able to mark its own order as paid')

  const ok = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: validJobOrder({ extraNotesHp: '' }) } })
  assert.equal(ok.status, 201)
  assert.match(ok.data.authorizationUrl, /^https:\/\/checkout\.paystack\.com\//)
  const order = state.employers.find((row) => row.details.paymentReference === ok.data.reference)
  assert.equal(order.details.paymentStatus, 'pending')
  assert.equal(order.details.email, 'hiring@acme.co.za')
  assert.equal(order.details.extraNotesHp, undefined)
})

test('employer checkout refuses a non-Paystack redirect from upstream', async () => {
  state.checkoutUrl = 'https://evil.example/phish'
  const res = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: validJobOrder() } })
  state.checkoutUrl = undefined
  assert.equal(res.status, 502)
})

test('payment verification only marks paid when amount, currency and email match', async () => {
  const init = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: validJobOrder() } })
  const reference = init.data.reference
  assert.equal((await call('/api/payments/paystack/verify', { method: 'POST', body: { reference: 'IMF-../../x' } })).status, 400)

  state.paystackTransaction = { status: 'success', reference, amount: 100, currency: 'ZAR', customer: { email: 'hiring@acme.co.za' }, id: 1 }
  assert.equal((await call('/api/payments/paystack/verify', { method: 'POST', body: { reference } })).status, 402, 'underpayment must not count')

  state.paystackTransaction = { status: 'success', reference, amount: 49_900, currency: 'ZAR', customer: { email: 'hiring@acme.co.za' }, id: 2, channel: 'card' }
  const paid = await call('/api/payments/paystack/verify', { method: 'POST', body: { reference } })
  assert.equal(paid.status, 200)
  assert.equal(state.employers.find((row) => row.details.paymentReference === reference).details.paymentStatus, 'paid')
})

test('payment webhook rejects forged signatures and accepts genuine ones', async () => {
  const init = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: validJobOrder() } })
  const reference = init.data.reference
  const raw = JSON.stringify({ event: 'charge.success', data: { reference } })

  const forged = await call('/api/payments/paystack/webhook', { method: 'POST', raw, headers: { 'x-paystack-signature': 'ab'.repeat(64) } })
  assert.equal(forged.status, 401)
  const unsigned = await call('/api/payments/paystack/webhook', { method: 'POST', raw })
  assert.equal(unsigned.status, 401)

  state.paystackTransaction = { status: 'success', reference, amount: 49_900, currency: 'ZAR', customer: { email: 'hiring@acme.co.za' }, id: 3 }
  const genuine = await call('/api/payments/paystack/webhook', { method: 'POST', raw, headers: { 'x-paystack-signature': signLegacy(raw) } })
  assert.equal(genuine.status, 200)
  assert.equal(state.employers.find((row) => row.details.paymentReference === reference).details.paymentStatus, 'paid')
})

test('public write endpoints are rate limited with Retry-After', async () => {
  const ip = '198.51.100.77'
  let last
  for (let i = 0; i < 7; i += 1) last = await call('/api/contact', { method: 'POST', ip, body: {} })
  assert.equal(last.status, 429)
  assert.ok(Number(last.headers.get('retry-after')) > 0)
})

test('staff actions are written to the audit log with actor, entity and changed fields', async () => {
  const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
  const before = state.audit.length
  await call('/api/staff/login', { method: 'POST', body: { email: 'auditor-check@imforce.co.za', password: 'nope' } })
  assert.equal(state.audit.length, before, 'failed sign-ins go to security_events, not the staff audit log')

  const vacancy = { clientName: 'Audit Client', title: 'Audit Clerk', location: 'Durban', region: 'KZN', category: 'Admin', employmentType: 'Permanent', summary: 'Audit role', responsibilities: ['Filing'] }
  const created = await call('/api/staff/vacancies', { method: 'POST', headers: auth, body: vacancy })
  const id = created.data.vacancy.id
  const updated = await call(`/api/staff/vacancies/${id}`, { method: 'PUT', headers: auth, body: { ...vacancy, title: 'Senior Audit Clerk', salary: 'ZAR 20 000' } })
  assert.equal(updated.status, 200)
  await call('/api/staff/inquiries', { headers: auth })
  await call(`/api/staff/vacancies/${id}`, { method: 'DELETE', headers: auth })

  const entries = state.audit.slice(before)
  assert.deepEqual(entries.map((entry) => entry.action), ['vacancy.create', 'vacancy.update', 'enquiries.view', 'vacancy.delete'])
  for (const entry of entries) {
    assert.equal(entry.actor_email, 'staff@imforce.co.za')
    assert.ok(entry.ip_address)
  }
  assert.deepEqual(entries[1].detail.changedFields.sort(), ['salary', 'title'])
  assert.equal(entries[3].detail.title, 'Senior Audit Clerk', 'deleted record keeps a snapshot of what was removed')

  const log = await call('/api/staff/audit', { headers: auth })
  assert.equal(log.status, 200)
  assert.ok(log.data.entries.length >= 4)
  assert.equal((await call('/api/staff/audit')).status, 401, 'the activity log is staff-only')
})

test('sign-in and sign-out are audited', async () => {
  const before = state.audit.length
  const login = await call('/api/staff/login', { method: 'POST', body: { email: 'second.staff@imforce.co.za', password: 'correct-horse' } })
  assert.equal(login.status, 200)
  await call('/api/staff/logout', { method: 'POST', body: {}, headers: { Authorization: `Bearer ${VALID_TOKEN}` } })
  assert.deepEqual(state.audit.slice(before).map((entry) => entry.action), ['staff.login', 'staff.logout'])
})
