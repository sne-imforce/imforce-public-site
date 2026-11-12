'use strict'
// Advert review: staff approve paid job orders before the advert goes online.
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { call, stop, state, validJobOrder, VALID_TOKEN } = require('./helpers')

test.after(stop)

const auth = { Authorization: `Bearer ${VALID_TOKEN}` }
const advert = { clientName: 'Acme Holdings', title: 'Senior Accountant', location: 'Cape Town', region: 'Western Cape', category: 'Finance', employmentType: 'Permanent', summary: 'Prepare monthly management accounts.', responsibilities: ['Reconciliations', 'VAT returns'] }
function addOrder(paymentStatus = 'paid', reviewStatus = 'pending') {
  const row = { id: crypto.randomUUID(), details: { ...validJobOrder(), paymentStatus, paymentReference: `IMF-${crypto.randomUUID()}` }, review_status: reviewStatus, created_at: new Date().toISOString() }
  state.employers.push(row)
  return row
}
const review = (id, body, headers = auth) => call(`/api/staff/job-orders/${id}/review`, { method: 'POST', body, headers })

test('approving a paid job order publishes the advert and records reviewer, time and link', async () => {
  const order = addOrder()
  const res = await review(order.id, { decision: 'approve', vacancy: advert })
  assert.equal(res.status, 200)
  assert.equal(res.data.reviewStatus, 'approved')
  assert.equal(res.data.vacancy.title, 'Senior Accountant')
  assert.equal(order.review_status, 'approved')
  assert.equal(order.reviewed_by_name, 'Thandi Mokoena')
  assert.ok(order.reviewed_at)
  assert.equal(order.vacancy_id, res.data.vacancy.id)
  assert.ok(state.vacancies.some((row) => row.id === res.data.vacancy.id))
  assert.equal(state.audit.at(-1).action, 'advert.approve')
})

test('unpaid job orders cannot be approved', async () => {
  const order = addOrder('pending')
  const before = state.vacancies.length
  const res = await review(order.id, { decision: 'approve', vacancy: advert })
  assert.equal(res.status, 409)
  assert.match(res.data.error, /not been paid/)
  assert.equal(order.review_status, 'pending')
  assert.equal(state.vacancies.length, before, 'no advert published')
})

test('a job order can only be reviewed once (no double approval by two staff)', async () => {
  const order = addOrder()
  assert.equal((await review(order.id, { decision: 'approve', vacancy: advert })).status, 200)
  const before = state.vacancies.length
  const second = await review(order.id, { decision: 'approve', vacancy: advert })
  assert.equal(second.status, 409)
  assert.equal(state.vacancies.length, before)
})

test('requesting changes or rejecting requires a reason, which is stored', async () => {
  const order = addOrder()
  assert.equal((await review(order.id, { decision: 'changes' })).status, 400)
  assert.equal((await review(order.id, { decision: 'reject', reason: 'no' })).status, 400)
  const res = await review(order.id, { decision: 'changes', reason: 'Please add the salary range and working hours.' })
  assert.equal(res.status, 200)
  assert.equal(order.review_status, 'changes_requested')
  assert.equal(order.review_reason, 'Please add the salary range and working hours.')
  assert.equal(state.audit.at(-1).action, 'advert.request_changes')
  assert.equal(state.audit.at(-1).detail.reason, 'Please add the salary range and working hours.')
})

test('a reviewed order can be reopened and reviewed again', async () => {
  const order = addOrder('paid', 'rejected')
  order.review_reason = 'Duplicate order'
  assert.equal((await review(order.id, { decision: 'reopen' })).status, 200)
  assert.equal(order.review_status, 'pending')
  assert.equal(order.review_reason, null)
  assert.equal((await review(order.id, { decision: 'approve', vacancy: advert })).status, 200)
})

test('approval validates the advert like any job post (no unsafe links)', async () => {
  const order = addOrder()
  const res = await review(order.id, { decision: 'approve', vacancy: { ...advert, applicationUrl: 'javascript:alert(1)' } })
  assert.equal(res.status, 400)
  assert.equal(order.review_status, 'pending')
})

test('if publishing fails, the order goes back to the review queue (never approved without an advert)', async () => {
  const order = addOrder()
  state.failNextVacancyInsert = true
  const res = await review(order.id, { decision: 'approve', vacancy: advert })
  assert.equal(res.status, 502)
  assert.match(res.data.error, /back in the review queue/)
  assert.equal(order.review_status, 'pending')
  assert.equal(order.reviewed_by_name, null)
})

test('review endpoint is staff-only and validates ids and decisions', async () => {
  const order = addOrder()
  assert.equal((await review(order.id, { decision: 'approve', vacancy: advert }, {})).status, 401)
  assert.equal((await review('not-a-uuid', { decision: 'approve' })).status, 404)
  assert.equal((await review(order.id, { decision: 'publish-everything' })).status, 400)
  assert.equal((await review(crypto.randomUUID(), { decision: 'reject', reason: 'Not found case' })).status, 404)
})

test('staff enquiries include each job order’s review status', async () => {
  const res = await call('/api/staff/inquiries', { headers: auth })
  assert.equal(res.status, 200)
  const orders = res.data.inquiries.filter((item) => item.kind === 'employer')
  assert.ok(orders.length > 0 && orders.every((item) => 'review_status' in item))
})
