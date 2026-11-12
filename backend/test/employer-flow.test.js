'use strict'
// Employer journey after the PM review: confirmation, approval and payment-link
// emails; paying again without creating a duplicate order; late payments on an
// older checkout; and staff seeing what the employer changed.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { call, stop, state, settle, validJobOrder, signLegacy, VALID_TOKEN } = require('./helpers')
const { mailer } = require('../server')

test.after(stop)

const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
const initialize = (details = validJobOrder()) => call('/api/payments/paystack/initialize', { method: 'POST', body: { details } })
const resume = (token, details) => call('/api/payments/paystack/resume', { method: 'POST', body: details === undefined ? { token } : { token, details } })
const verify = (reference) => call('/api/payments/paystack/verify', { method: 'POST', body: { reference } })
const paidTransaction = (reference, id = crypto.randomInt(1, 1e9)) => ({ status: 'success', reference, amount: 49_900, currency: 'ZAR', customer: { email: 'hiring@acme.co.za' }, id, channel: 'card' })
const orderFor = (reference) => state.employers.find((row) => row.details.paymentReferences?.includes(reference) || row.details.paymentReference === reference)
const emailsTo = (address) => mailer.outbox.filter((email) => email.to === address)
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

test('paying again from the same tab reuses the job order (no duplicate) and keeps the old reference', async () => {
  const first = await initialize()
  assert.equal(first.status, 201)
  assert.match(first.data.resumeToken, /^[A-Za-z0-9_-]{43}$/)
  const order = orderFor(first.data.reference)
  const before = state.employers.length
  assert.equal(state.paymentLinks.at(-1).token_hash, sha256(first.data.resumeToken), 'only the hash is stored')

  const again = await resume(first.data.resumeToken, validJobOrder({ salary: 'ZAR 50 000 per month' }))
  assert.equal(again.status, 200)
  assert.match(again.data.authorizationUrl, /^https:\/\/checkout\.paystack\.com\//)
  assert.notEqual(again.data.reference, first.data.reference, 'each checkout gets a fresh reference')
  assert.equal(state.employers.length, before, 'no new job order was created')
  assert.equal(order.details.paymentReference, again.data.reference)
  assert.deepEqual(order.details.paymentReferences, [first.data.reference, again.data.reference])
  assert.equal(order.details.salary, 'ZAR 50 000 per month', 'corrections made before paying are kept')
  assert.equal(order.details.paymentStatus, 'pending')
})

test('a late payment on an older checkout is still matched to the order, and confirmed only once', async () => {
  const first = await initialize()
  const order = orderFor(first.data.reference)
  const second = await resume(first.data.resumeToken)
  assert.equal(second.status, 200)
  const sentBefore = emailsTo('hiring@acme.co.za').length

  state.paystackTransaction = paidTransaction(first.data.reference)
  const paid = await verify(first.data.reference)
  assert.equal(paid.status, 200)
  assert.equal(order.details.paymentStatus, 'paid')
  assert.equal(order.details.paymentReference, first.data.reference, 'records the reference that was actually paid')
  assert.match(paid.data.reference, /^ORD-[0-9A-F]{8}$/)
  assert.match(paid.data.message, /within 1 business day/)

  // The return page and the webhook both confirm: one email only.
  const raw = JSON.stringify({ event: 'charge.success', data: { reference: first.data.reference } })
  assert.equal((await call('/api/payments/paystack/webhook', { method: 'POST', raw, headers: { 'x-paystack-signature': signLegacy(raw) } })).status, 200)
  assert.equal((await verify(first.data.reference)).status, 200)
  const sent = emailsTo('hiring@acme.co.za').slice(sentBefore)
  assert.equal(sent.length, 1, 'exactly one confirmation email')
  assert.match(sent[0].subject, /We received your job order: Senior Accountant \(ORD-/)
  assert.match(sent[0].text, /within 1 business day/)
  assert.match(sent[0].text, /033 492 0600/)

  // Once paid, the payment links stop working and paying again is refused.
  const after = await resume(first.data.resumeToken)
  assert.equal(after.status, 404)
})

test('paying again is refused if the order was paid meanwhile (never overwrites a payment)', async () => {
  const first = await initialize()
  const order = orderFor(first.data.reference)
  order.details.paymentStatus = 'paid' // e.g. the webhook landed between two clicks
  const res = await resume(first.data.resumeToken)
  assert.equal(res.status, 409)
  assert.equal(res.data.alreadyPaid, true)
  assert.equal(order.details.paymentStatus, 'paid')
  assert.equal(order.details.paymentReference, first.data.reference)
})

test('payment links reject bad tokens, invalid details and bot submissions', async () => {
  assert.equal((await resume('not-a-token')).status, 404)
  assert.equal((await resume('A'.repeat(43))).status, 404)
  await settle()
  assert.ok(state.events.some((event) => event.event_type === 'invalid-payment-link'))
  const first = await initialize()
  assert.equal((await resume(first.data.resumeToken, validJobOrder({ email: 'not-an-email' }))).status, 400)
  assert.equal((await resume(first.data.resumeToken, validJobOrder({ extraNotesHp: 'bot' }))).status, 400)
  assert.equal((await resume(first.data.resumeToken, ['x'])).status, 400)
})

test('staff can email a payment link for an unpaid order; it only pays, and replaces the previous one', async () => {
  const first = await initialize()
  const order = orderFor(first.data.reference)
  const send = () => call(`/api/staff/job-orders/${order.id}/payment-link`, { method: 'POST', headers: auth, body: {} })
  assert.equal((await call(`/api/staff/job-orders/${order.id}/payment-link`, { method: 'POST', body: {} })).status, 401)
  assert.equal((await call('/api/staff/job-orders/not-a-uuid/payment-link', { method: 'POST', headers: auth, body: {} })).status, 404)

  const res = await send()
  assert.equal(res.status, 200)
  assert.equal(res.data.paymentLink.emailStatus, 'sent')
  assert.equal(res.data.paymentLink.link, null, 'not shown to staff when emailed')
  const email = mailer.outbox.at(-1)
  assert.equal(email.to, 'hiring@acme.co.za')
  assert.match(email.subject, /Complete the payment for your IMFORCE job order: Senior Accountant/)
  assert.match(email.text, /Pay ZAR 499 securely: https:\/\/www\.imforce\.co\.za\/employers\/complete-payment#token=/)
  assert.equal(state.audit.at(-1).action, 'payment.link_sent')
  const token = email.text.match(/#token=([A-Za-z0-9_-]{43})/)[1]

  const opened = await call('/api/payments/link/open', { method: 'POST', body: { token } })
  assert.equal(opened.status, 200)
  assert.equal(opened.headers.get('cache-control'), 'no-store')
  assert.equal(opened.data.jobTitle, 'Senior Accountant')
  assert.equal(opened.data.paid, false)
  assert.equal('email' in opened.data || 'details' in opened.data, false, 'shows a summary only')
  assert.equal((await resume(token, validJobOrder())).status, 400, 'a staff link cannot change the order')
  assert.equal((await resume(token)).status, 200)

  await send()
  assert.equal((await resume(token)).status, 404, 'the previous staff link stops working')
  assert.equal((await resume(first.data.resumeToken)).status, 200, 'the employer’s own checkout link is unaffected')

  const list = await call('/api/staff/inquiries', { headers: auth })
  const listed = list.data.inquiries.find((item) => item.id === order.id)
  assert.equal(listed.payment_link.email_status, 'sent')
  assert.equal('token_hash' in listed.payment_link, false, 'never exposes the token hash')

  order.details.paymentStatus = 'paid'
  assert.equal((await send()).status, 409, 'paid orders do not need a payment link')
})

test('approving an advert emails the employer that it is live, with a link to it', async () => {
  const order = { id: crypto.randomUUID(), details: { ...validJobOrder(), email: 'live@acme.co.za', paymentStatus: 'paid', paymentReference: `IMF-${crypto.randomUUID()}` }, review_status: 'pending', created_at: new Date().toISOString() }
  state.employers.push(order)
  const res = await call(`/api/staff/job-orders/${order.id}/review`, {
    method: 'POST', headers: auth,
    body: { decision: 'approve', vacancy: { clientName: 'Acme', title: 'Senior Accountant', location: 'Cape Town', region: 'Western Cape', category: 'Finance', employmentType: 'Permanent', summary: 'Prepare monthly accounts.', responsibilities: ['Reconciliations'] } },
  })
  assert.equal(res.status, 200)
  assert.equal(res.data.employerEmail, 'sent')
  const [email] = emailsTo('live@acme.co.za')
  assert.match(email.subject, /Your job advert is live: Senior Accountant/)
  assert.ok(email.text.includes(`https://www.imforce.co.za/careers#job-${res.data.vacancy.id}`))
})

test('when the employer resubmits, staff see which fields changed', async () => {
  const order = { id: crypto.randomUUID(), details: { ...validJobOrder(), email: 'diff@acme.co.za', paymentStatus: 'paid', paymentReference: `IMF-${crypto.randomUUID()}` }, review_status: 'pending', created_at: new Date().toISOString() }
  state.employers.push(order)
  await call(`/api/staff/job-orders/${order.id}/review`, { method: 'POST', headers: auth, body: { decision: 'changes', reason: 'Please add the salary range.' } })
  const token = emailsTo('diff@acme.co.za').at(-1).text.match(/#token=([A-Za-z0-9_-]{43})/)[1]
  const { email, authorizedContact, paymentStatus, paymentReference, ...rest } = order.details
  const res = await call('/api/job-order-changes/submit', { method: 'POST', body: { token, details: { ...rest, authorizedContact: true, salary: 'ZAR 60 000 per month', workingHours: 'Mon-Fri 07:30-16:30' } } })
  assert.equal(res.status, 200)
  assert.deepEqual(order.details.lastChangedFields, ['Working hours', 'Salary or salary range'])
  assert.deepEqual(state.audit.at(-1).detail.changedFields, ['Working hours', 'Salary or salary range'])
})
