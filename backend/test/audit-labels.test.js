'use strict'
// Guard: every action the database allows in the audit log has a readable
// label on the Audit log screen, and every action the API writes is allowed.
// (A missing label shows staff a raw code such as "advert.approve".)
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('every audit action has a readable label on the Audit log screen', () => {
  const dir = path.join(__dirname, '..', 'migrations')
  const marker = 'staff_audit_log_action_check check (action in ('
  const latest = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8')).filter((sql) => sql.includes(marker)).at(-1)
  const allowed = [...latest.split(marker)[1].split('))')[0].matchAll(/'([a-z_.]+)'/g)].map((match) => match[1])
  const screen = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'admin', 'AuditLogPage.tsx'), 'utf8')
  assert.ok(allowed.includes('advert.approve'))
  assert.deepEqual(allowed.filter((action) => !screen.includes(`'${action}':`)), [], 'actions without a label')

  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8')
  const written = [...server.matchAll(/audit\(req, '([a-z_.]+)'/g), ...server.matchAll(/action: '([a-z_.]+)'/g)].map((match) => match[1])
  assert.ok(written.length >= 10)
  for (const action of written) assert.ok(allowed.includes(action), `${action} is written by the API but not allowed by the database`)
})
