'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { call, stop, state, settle, security } = require('./helpers')
const { isPrivateAddress, createSecurityMonitor } = require('../security')

test.after(stop)

test('honeypot routes look like ordinary 404s, raise an alarm and block the attacker', async () => {
  const ip = '192.0.2.50'
  const trap = await call('/.env', { ip })
  assert.equal(trap.status, 404)
  assert.deepEqual(trap.data, { error: 'Not found.' }, 'trap must not reveal itself')
  await settle()

  assert.ok(state.alerts.some((alert) => alert.event.ip === ip && alert.event.type === 'honeypot'), 'alert webhook fired')
  assert.ok(state.events.some((event) => event.ip_address === ip && event.event_type === 'honeypot'), 'event stored in security_events')

  const after = await call('/api/health', { ip })
  assert.equal(after.status, 403, 'attacker is blocked from the whole API')
  const bystander = await call('/api/health')
  assert.equal(bystander.status, 200, 'other visitors are unaffected')
})

test('every well-known scanner target is trapped', async () => {
  for (const path of ['/wp-admin/', '/wp-login.php', '/.git/config', '/phpmyadmin/', '/index.php', '/api/admin', '/api/internal/backup', '/api/debug/vars', '/api/users', '/api/staff/register', '/server-status', '/actuator/env', '/backup.sql']) {
    const res = await call(path)
    assert.equal(res.status, 404, path)
  }
  await settle()
  const trapped = new Set(state.events.filter((e) => e.event_type === 'honeypot').map((e) => e.path))
  assert.ok(trapped.has('/api/internal/backup') && trapped.has('/wp-login.php') && trapped.has('/api/users'))
})

test('legitimate routes never trip the honeypot', async () => {
  const before = state.events.length
  for (const path of ['/api/health', '/api/vacancies']) await call(path)
  await settle()
  assert.equal(state.events.slice(before).filter((e) => e.event_type === 'honeypot').length, 0)
})

test('attack payloads are logged, and repeat offenders get blocked', async () => {
  const ip = '192.0.2.60'
  const payload = { name: 'x', email: 'x@example.com', enquiryType: 'Other enquiry', subject: "' OR 1=1 --", message: '<script>alert(document.cookie)</script>' }
  const first = await call('/api/contact', { method: 'POST', ip, body: payload })
  assert.equal(first.status, 201, 'a single odd message is still accepted (no false-positive lockout)')
  await settle()
  assert.ok(state.events.some((e) => e.ip_address === ip && e.event_type.startsWith('attack-signature')))

  for (let i = 0; i < 4; i += 1) await call(`/api/vacancies?q=${encodeURIComponent('1 UNION SELECT password FROM users')}`, { ip })
  assert.equal((await call('/api/health', { ip })).status, 403)
})

test('filled hidden form field (bot trap) is silently accepted but not stored', async () => {
  const ip = '192.0.2.70'
  const before = state.contacts.length
  const res = await call('/api/contact', { method: 'POST', ip, body: { website: 'http://spam.example', name: 'Bot', email: 'bot@spam.example', enquiryType: 'Other enquiry', subject: 'Buy', message: 'Buy now' } })
  assert.equal(res.status, 200)
  assert.equal(state.contacts.length, before)
  await settle()
  assert.ok(state.events.some((e) => e.ip_address === ip && e.event_type === 'bot-honeypot-field'))
})

test('forged payment webhooks raise a high-severity alert', async () => {
  const ip = '192.0.2.80'
  await call('/api/payments/paystack/webhook', { method: 'POST', ip, raw: '{"event":"charge.success"}', headers: { 'x-paystack-signature': '00'.repeat(64) } })
  await settle()
  assert.ok(state.alerts.some((a) => a.event.ip === ip && a.event.type === 'forged-payment-webhook'))
})

test('log injection: control characters are stripped from logged values', () => {
  const lines = []
  const monitor = createSecurityMonitor({ logger: (line) => lines.push(line), blockPrivateAddresses: true })
  monitor.record({ ip: '203.0.113.9', method: 'GET', originalUrl: '/x\n{"level":"fake"}', get: () => 'agent\r\nInjected: yes' }, 'test', 'low')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].includes('\n'), false)
  const parsed = JSON.parse(lines[0])
  assert.equal(parsed.userAgent.includes('\r'), false)
})

test('private / proxy addresses alarm but are never auto-blocked unless configured', () => {
  for (const ip of ['127.0.0.1', '::1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '::ffff:10.0.0.1', 'fd00::1']) assert.equal(isPrivateAddress(ip), true, ip)
  for (const ip of ['8.8.8.8', '203.0.113.1', '2001:4860::8888']) assert.equal(isPrivateAddress(ip), false, ip)
  const monitor = createSecurityMonitor({ logger: () => {} })
  const req = { ip: '10.0.0.5', method: 'GET', originalUrl: '/.env', get: () => '' }
  const event = monitor.record(req, 'honeypot', 'critical')
  assert.equal(event.action, 'alert-only')
  assert.equal(monitor.isBlocked('10.0.0.5'), false)
})

test('allowlisted IPs are never blocked', () => {
  const monitor = createSecurityMonitor({ logger: () => {}, allowlist: ['198.51.100.1'] })
  monitor.record({ ip: '198.51.100.1', method: 'GET', originalUrl: '/.env', get: () => '' }, 'honeypot', 'critical')
  assert.equal(monitor.isBlocked('198.51.100.1'), false)
})

test('alerts are throttled so an attack cannot flood the alert channel', async () => {
  const sent = []
  const monitor = createSecurityMonitor({ logger: () => {}, alertWebhookUrl: 'https://alerts.test/x', sendAlert: async (_url, event) => sent.push(event) })
  for (let i = 0; i < 20; i += 1) monitor.record({ ip: '203.0.113.200', method: 'GET', originalUrl: '/.env', get: () => '' }, 'honeypot', 'critical')
  await settle()
  assert.ok(sent.length <= 2, `sent ${sent.length} alerts`)
})

test('exported monitor is the one wired into the app', () => {
  assert.equal(typeof security.record, 'function')
})

test('job order bot trap field rejects bots without storing the order', async () => {
  const { validJobOrder } = require('./helpers')
  const before = state.employers.length
  const res = await call('/api/payments/paystack/initialize', { method: 'POST', body: { details: validJobOrder({ extraNotesHp: 'filled by bot' }) } })
  assert.equal(res.status, 400)
  assert.equal(state.employers.length, before)
})

test('renamed contact bot trap field is honoured', async () => {
  const before = state.contacts.length
  const res = await call('/api/contact', { method: 'POST', body: { extraNotesHp: 'x', name: 'Bot', email: 'bot@spam.example', enquiryType: 'Other enquiry', subject: 'Buy', message: 'Buy now' } })
  assert.equal(res.status, 200)
  assert.equal(state.contacts.length, before)
})
