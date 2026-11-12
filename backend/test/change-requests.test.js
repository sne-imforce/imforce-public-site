'use strict'
// "Request changes": the employer gets an email with a private, one-time link to update the job order.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { call, stop, state, settle, validJobOrder, VALID_TOKEN } = require('./helpers')
const { mailer } = require('../server')

test.after(stop)

const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
function addPaidOrder() {
  const row = { id: crypto.randomUUID(), details: { ...validJobOrder(), email: 'hiring@acme.co.za', paymentStatus: 'paid', paymentReference: `IMF-${crypto.randomUUID()}`, paystackTransactionId: '123' }, review_status: 'pending', created_at: new Date().toISOString() }
  state.employers.push(row)
  return row
}
const requestChanges = (order, reason = 'Please add the salary range and working hours.') =>
  call(`/api/staff/job-orders/${order.id}/review`, { method: 'POST', headers: auth, body: { decision: 'changes', reason } })
const tokenFromEmail = () => mailer.outbox.at(-1).text.match(/#token=([A-Za-z0-9_-]{43})/)[1]
const open = (token) => call('/api/job-order-changes/open', { method: 'POST', body: { token } })
const submit = (token, details) => call('/api/job-order-changes/submit', { method: 'POST', body: { token, details } })
const editable = (order, overrides = {}) => {
  const { email, authorizedContact, paymentStatus, paymentReference, paystackTransactionId, ...rest } = order.details
  return { ...rest, authorizedContact: true, ...overrides }
}

test('requesting changes emails the employer a private link with the reason', async () => {
  const order = addPaidOrder()
  const res = await requestChanges(order)
  assert.equal(res.status, 200)
  assert.equal(res.data.changeLink.emailStatus, 'sent')
  assert.equal(res.data.changeLink.sentTo, 'hiring@acme.co.za')
  assert.equal(res.data.changeLink.link, null, 'the link is not shown to staff when it was emailed')
  const email = mailer.outbox.at(-1)
  assert.equal(email.to, 'hiring@acme.co.za')
  assert.match(email.subject, /Changes needed to your IMFORCE job advert: Senior Accountant/)
  assert.match(email.text, /Please add the salary range and working hours\./)
  assert.match(email.text, /https:\/\/www\.imforce\.co\.za\/employers\/update-job-order#token=/)
  const stored = state.changeRequests.at(-1)
  assert.equal(stored.token_hash, crypto.createHash('sha256').update(tokenFromEmail()).digest('hex'))
  assert.equal(JSON.stringify(state.changeRequests).includes(tokenFromEmail()), false, 'only the hash is stored')
  assert.equal(stored.email_status, 'sent')
})

test('the email escapes HTML in the reason (no injected markup)', async () => {
  const order = addPaidOrder()
  await requestChanges(order, '<script>alert(1)</script> please fix the title')
  assert.equal(mailer.outbox.at(-1).html.includes('<script>'), false)
  assert.match(mailer.outbox.at(-1).html, /&lt;script&gt;/)
})

test('the link opens the order with the reason, but never exposes payment data', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const res = await open(tokenFromEmail())
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.data.reason, 'Please add the salary range and working hours.')
  assert.equal(res.data.details.jobTitle, 'Senior Accountant')
  assert.equal(res.data.details.email, 'hiring@acme.co.za')
  assert.equal(JSON.stringify(res.data).includes('paymentReference'), false)
  assert.equal(JSON.stringify(res.data).includes('paystackTransactionId'), false)
})

test('submitting changes puts the order back in the review queue and records it', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const token = tokenFromEmail()
  const res = await submit(token, editable(order, { salary: 'ZAR 40 000 - 45 000 per month', workingHours: 'Mon-Fri 07:30-16:30' }))
  assert.equal(res.status, 200)
  assert.equal(order.review_status, 'pending')
  assert.equal(order.details.salary, 'ZAR 40 000 - 45 000 per month')
  assert.equal(order.details.paymentStatus, 'paid', 'payment data untouched')
  assert.equal(order.details.lastChangeRequest, 'Please add the salary range and working hours.')
  assert.ok(order.details.resubmittedAt)
  assert.equal(state.audit.at(-1).action, 'advert.resubmitted')
  assert.equal(state.audit.at(-1).actor_name, 'Acme Holdings (Pty) Ltd (employer)')
})

test('a link works only once', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const token = tokenFromEmail()
  assert.equal((await submit(token, editable(order))).status, 200)
  assert.equal((await submit(token, editable(order))).status, 404)
  assert.equal((await open(token)).status, 404)
})

test('the employer cannot change the email or payment fields, or add unknown fields', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const token = tokenFromEmail()
  for (const extra of [{ email: 'attacker@evil.example' }, { paymentStatus: 'paid' }, { paystackTransactionId: 'x' }, { isAdmin: true }]) {
    const res = await submit(token, editable(order, extra))
    assert.equal(res.status, 400, JSON.stringify(extra))
  }
  assert.equal(order.details.email, 'hiring@acme.co.za')
  assert.equal(order.review_status, 'changes_requested')
})

test('changes are validated like the original job order', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const token = tokenFromEmail()
  const res = await submit(token, editable(order, { duties: 'Too short', closingDate: '2020-01-01' }))
  assert.equal(res.status, 400)
  assert.ok(res.data.errors.some((issue) => issue.field === 'duties'))
  assert.ok(res.data.errors.some((issue) => issue.field === 'closingDate'))
  const noConfirm = await submit(token, editable(order, { authorizedContact: false }))
  assert.ok(noConfirm.data.errors.some((issue) => issue.field === 'authorizedContact'))
  assert.equal((await open(token)).status, 200, 'a rejected submission does not use up the link')
})

test('expired, malformed and guessed links are refused (and noticed by the alarm)', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const token = tokenFromEmail()
  state.changeRequests.at(-1).expires_at = new Date(Date.now() - 1000).toISOString()
  assert.equal((await open(token)).status, 404)
  assert.equal((await open('not-a-token')).status, 404)
  assert.equal((await open('A'.repeat(43))).status, 404)
  await settle()
  assert.ok(state.events.some((event) => event.event_type === 'invalid-change-link'))
})

test('sending a new link cancels the old one; reopening cancels any link', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const first = tokenFromEmail()
  const resend = await call(`/api/staff/job-orders/${order.id}/change-link`, { method: 'POST', headers: auth, body: {} })
  assert.equal(resend.status, 200)
  const second = tokenFromEmail()
  assert.notEqual(first, second)
  assert.equal((await open(first)).status, 404, 'old link no longer works')
  assert.equal((await open(second)).status, 200)
  assert.equal(state.audit.at(-1).action, 'advert.change_link_resent')

  await call(`/api/staff/job-orders/${order.id}/review`, { method: 'POST', headers: auth, body: { decision: 'reopen' } })
  assert.equal((await open(second)).status, 404, 'reopening cancels the outstanding link')
})

test('a new link can only be sent while changes are requested', async () => {
  const order = addPaidOrder()
  const res = await call(`/api/staff/job-orders/${order.id}/change-link`, { method: 'POST', headers: auth, body: {} })
  assert.equal(res.status, 409)
  assert.equal((await call(`/api/staff/job-orders/${order.id}/change-link`, { method: 'POST', body: {} })).status, 401)
})

test('staff see the latest link status on each job order (never the token)', async () => {
  const order = addPaidOrder()
  await requestChanges(order)
  const res = await call('/api/staff/inquiries', { headers: auth })
  const row = res.data.inquiries.find((item) => item.id === order.id)
  assert.equal(row.change_request.email_status, 'sent')
  assert.ok(row.change_request.expires_at)
  assert.equal(JSON.stringify(row).includes('token'), false)
})
