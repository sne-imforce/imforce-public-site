'use strict'
// Runs in its own process with two-factor sign-in enforced, as in production.
process.env.STAFF_MFA_REQUIRED = 'true'
const test = require('node:test')
const assert = require('node:assert/strict')
const { call, stop, state, settle, MFA_TICKET, MFA_SESSION, MFA_CODE, VALID_TOKEN } = require('./helpers')

test.after(stop)

const signIn = (ip) => call('/api/staff/login', { method: 'POST', ip, body: { email: 'mfa.staff@imforce.co.za', password: 'correct-horse' } })

test('first sign-in requires authenticator enrolment; the password alone grants no access', async () => {
  const res = await signIn()
  assert.equal(res.status, 200)
  assert.equal(res.data.accessToken, undefined, 'no usable session before the second factor')
  assert.equal(res.data.mfa.step, 'enroll')
  assert.match(res.data.mfa.qrCode, /^data:image\/svg\+xml/)
  assert.ok(res.data.mfa.secret)

  const withTicket = await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${res.data.mfa.ticket}` } })
  assert.equal(withTicket.status, 401, 'a password-only (aal1) session is refused by staff routes')
})

test('a wrong code is refused; the right code completes sign-in and unlocks staff routes', async () => {
  const start = await signIn()
  const { ticket, factorId } = start.data.mfa
  const wrong = await call('/api/staff/mfa/verify', { method: 'POST', body: { ticket, factorId, code: '000000' } })
  assert.equal(wrong.status, 401)
  assert.equal(wrong.data.accessToken, undefined)

  const ok = await call('/api/staff/mfa/verify', { method: 'POST', body: { ticket, factorId, code: MFA_CODE } })
  assert.equal(ok.status, 200)
  assert.equal(ok.data.accessToken, MFA_SESSION)
  assert.equal((await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${MFA_SESSION}` } })).status, 200)
  assert.equal(state.audit.at(-1).action, 'staff.login')
  assert.equal(state.audit.at(-1).detail.mfa, true)
})

test('after enrolment, later sign-ins ask only for the code (no new QR code)', async () => {
  const res = await signIn()
  assert.equal(res.data.mfa.step, 'verify')
  assert.equal(res.data.mfa.qrCode, undefined)
  assert.equal(state.factors.filter((factor) => factor.status === 'verified').length, 1)
})

test('malformed codes, tickets and factor ids are rejected before reaching Supabase', async () => {
  const { ticket, factorId } = (await signIn()).data.mfa
  for (const body of [
    { ticket, factorId, code: '12345' },
    { ticket, factorId, code: 'abcdef' },
    { ticket, factorId: '../../admin', code: MFA_CODE },
    { ticket: 'not-a-token', factorId, code: MFA_CODE },
  ]) assert.equal((await call('/api/staff/mfa/verify', { method: 'POST', body })).status, 400, JSON.stringify(body))
})

test("a factor that is not the account's own is refused and raises an alarm", async () => {
  const { ticket } = (await signIn()).data.mfa
  const res = await call('/api/staff/mfa/verify', { method: 'POST', body: { ticket, factorId: '99999999-9999-4999-8999-999999999999', code: MFA_CODE } })
  assert.equal(res.status, 401)
  await settle()
  assert.ok(state.events.some((event) => event.event_type === 'mfa-factor-mismatch'))
})

test('legacy password-only tokens are refused when MFA is enforced', async () => {
  const res = await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${VALID_TOKEN}` } })
  assert.equal(res.status, 401)
  assert.match(res.data.error, /Two-factor/)
})

test('code guessing locks the account after 5 wrong codes, even across IPs', async () => {
  const { ticket, factorId } = (await signIn()).data.mfa
  for (let i = 0; i < 5; i += 1) await call('/api/staff/mfa/verify', { method: 'POST', body: { ticket, factorId, code: String(100000 + i) } })
  const correctButLocked = await call('/api/staff/mfa/verify', { method: 'POST', body: { ticket, factorId, code: MFA_CODE } })
  assert.equal(correctButLocked.status, 401)
  assert.equal(correctButLocked.data.accessToken, undefined)
})

test('the code step shares the strict sign-in rate limit', async () => {
  const ip = '198.51.100.123'
  let last
  for (let i = 0; i < 6; i += 1) last = await call('/api/staff/mfa/verify', { method: 'POST', ip, body: { ticket: MFA_TICKET, factorId: '99999999-9999-4999-8999-999999999999', code: '111111' } })
  // Either the rate limiter (429) or the alarm system's IP block (403) must stop it.
  assert.ok([403, 429].includes(last.status), `got ${last.status}`)
})
