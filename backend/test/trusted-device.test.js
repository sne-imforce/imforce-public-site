'use strict'
// "Remember this device for 30 days" (MFA enforced, own process so no lockouts carry over).
process.env.STAFF_MFA_REQUIRED = 'true'
const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { call, stop, state, MFA_CODE, MFA_TICKET } = require('./helpers')

test.after(stop)

const login = (cookie = '') => call('/api/staff/login', { method: 'POST', body: { username: 'mfa.staff', password: 'correct-horse' }, headers: cookie ? { Cookie: cookie } : {} })
const cookieFrom = (res) => (res.headers.getSetCookie?.() ?? []).find((value) => value.startsWith('imf_trusted_device=')) ?? ''
const cookiePair = (setCookie) => setCookie.split(';')[0]

async function verify(rememberDevice) {
  const step = (await login()).data.mfa
  return call('/api/staff/mfa/verify', { method: 'POST', body: { ticket: step.ticket, factorId: step.factorId, code: MFA_CODE, rememberDevice } })
}

test('without ticking the box, nothing is remembered and the next sign-in asks for the code', async () => {
  const res = await verify(false)
  assert.equal(res.status, 200)
  assert.equal(cookieFrom(res), '')
  assert.equal(res.data.deviceRemembered, false)
  assert.equal((await login()).data.mfa.step, 'verify')
})

let deviceCookie = ''

test('ticking "remember this device" sets a secure, script-proof cookie and stores only its hash', async () => {
  const res = await verify(true)
  assert.equal(res.status, 200)
  assert.equal(res.data.deviceRemembered, true)
  const setCookie = cookieFrom(res)
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)
  assert.match(setCookie, /Path=\/api\/staff/)
  assert.match(setCookie, /Max-Age=2592000/)
  deviceCookie = cookiePair(setCookie)
  const token = deviceCookie.split('=')[1]
  const stored = state.devices.at(-1)
  assert.equal(stored.token_hash, crypto.createHash('sha256').update(token).digest('hex'))
  assert.equal(JSON.stringify(state.devices).includes(token), false, 'the raw token is never stored')
  assert.ok(Date.parse(stored.expires_at) - Date.now() <= 30 * 86_400_000 + 5_000)
  assert.ok(state.audit.some((entry) => entry.action === 'device.trust'))
})

test('on the remembered device, the password alone signs in (no code)', async () => {
  const res = await login(deviceCookie)
  assert.equal(res.status, 200)
  assert.equal(res.data.mfa, undefined)
  assert.equal(res.data.accessToken, MFA_TICKET)
  assert.equal(res.data.deviceRemembered, true)
  assert.equal(state.audit.at(-1).detail.mfa, 'remembered-device')
  const staffRoute = await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${MFA_TICKET}`, Cookie: deviceCookie } })
  assert.equal(staffRoute.status, 200, 'the remembered browser can use staff routes')
})

test('the same password-only session is refused from any other browser', async () => {
  const elsewhere = await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${MFA_TICKET}` } })
  assert.equal(elsewhere.status, 401)
  const tampered = await call('/api/staff/vacancies', { headers: { Authorization: `Bearer ${MFA_TICKET}`, Cookie: 'imf_trusted_device=' + 'A'.repeat(43) } })
  assert.equal(tampered.status, 401)
  assert.equal((await login('imf_trusted_device=not-a-real-token')).data.mfa.step, 'verify')
})

test('a remembered device only works for the account that remembered it', async () => {
  state.devices.forEach((row) => { row.user_id_backup = row.user_id; row.user_id = '99999999-9999-4999-8999-999999999999' })
  assert.equal((await login(deviceCookie)).data.mfa.step, 'verify')
  state.devices.forEach((row) => { row.user_id = row.user_id_backup })
})

test('expired devices ask for the code again', async () => {
  const row = state.devices.at(-1)
  const saved = row.expires_at
  row.expires_at = new Date(Date.now() - 1000).toISOString()
  assert.equal((await login(deviceCookie)).data.mfa.step, 'verify')
  row.expires_at = saved
})

test('"Forget this device" revokes it, clears the cookie and asks for the code next time', async () => {
  const me = await call('/api/staff/me', { headers: { Authorization: `Bearer ${MFA_TICKET}`, Cookie: deviceCookie } })
  assert.equal(me.data.deviceRemembered, true)
  const forget = await call('/api/staff/devices/forget', { method: 'POST', body: {}, headers: { Authorization: `Bearer ${MFA_TICKET}`, Cookie: deviceCookie } })
  assert.equal(forget.status, 200)
  assert.match(cookieFrom(forget), /Max-Age=0/)
  assert.ok(state.devices.at(-1).revoked_at)
  assert.ok(state.audit.some((entry) => entry.action === 'device.forget'))
  assert.equal((await login(deviceCookie)).data.mfa.step, 'verify')
})

test('"forget all devices" revokes every remembered browser for the account', async () => {
  const first = cookiePair(cookieFrom(await verify(true)))
  const second = cookiePair(cookieFrom(await verify(true)))
  const session = (await verify(false)).data.accessToken
  await call('/api/staff/devices/forget', { method: 'POST', body: { scope: 'all' }, headers: { Authorization: `Bearer ${session}` } })
  assert.equal((await login(first)).data.mfa.step, 'verify')
  assert.equal((await login(second)).data.mfa.step, 'verify')
})

test('a wrong password still fails on a remembered device (the device never replaces the password)', async () => {
  const cookie = cookiePair(cookieFrom(await verify(true)))
  const res = await call('/api/staff/login', { method: 'POST', body: { username: 'mfa.staff', password: 'wrong' }, headers: { Cookie: cookie } })
  assert.equal(res.status, 401)
  assert.equal(res.data.accessToken, undefined)
})
