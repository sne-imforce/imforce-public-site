'use strict'
// Runs scripts/create-staff.js against a fake Supabase HTTP server.
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

const script = path.join(__dirname, '..', 'scripts', 'create-staff.js')

function fakeSupabase({ takenUsernames = [], failProfileInsert = false } = {}) {
  const calls = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined
      calls.push({ method: req.method, url: req.url, body, apikey: req.headers.apikey })
      const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(data === undefined ? '' : JSON.stringify(data)) }
      if (req.url.startsWith('/rest/v1/staff_profiles?username=eq.')) {
        const name = decodeURIComponent(req.url.split('eq.')[1].split('&')[0])
        return send(200, takenUsernames.includes(name) ? [{ user_id: 'x' }] : [])
      }
      if (req.url === '/auth/v1/admin/users' && req.method === 'POST') return send(200, { id: '55555555-5555-4555-8555-555555555555', email: body.email })
      if (req.url === '/rest/v1/staff_profiles' && req.method === 'POST') return failProfileInsert ? send(409, { message: 'duplicate key' }) : send(201)
      if (req.url.startsWith('/auth/v1/admin/users/') && req.method === 'DELETE') return send(200, {})
      send(404, { message: 'not mocked' })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}` })))
}

function run(url, answers) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-service-key' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('close', (code) => resolve({ code, output }))
    child.stdin.end(`${answers.join('\n')}\n`)
  })
}

const good = ['Thandi Mokoena', 'Thandi.Mokoena', 'Thandi@IMFORCE.co.za', 'blue-river-sunrise-42', 'blue-river-sunrise-42']

test('creates the login and the staff profile with name, username and email', async () => {
  const fake = await fakeSupabase()
  const { code, output } = await run(fake.url, good)
  fake.server.close()
  assert.equal(code, 0, output)
  assert.match(output, /Thandi Mokoena can now sign in at \/admin with the username “thandi.mokoena”/)
  const created = fake.calls.find((call) => call.url === '/auth/v1/admin/users')
  assert.equal(created.body.email, 'thandi@imforce.co.za')
  assert.equal(created.body.email_confirm, true)
  assert.equal(created.apikey, 'test-service-key')
  const profile = fake.calls.find((call) => call.url === '/rest/v1/staff_profiles' && call.method === 'POST')
  assert.deepEqual(profile.body, { user_id: '55555555-5555-4555-8555-555555555555', username: 'thandi.mokoena', display_name: 'Thandi Mokoena', active: true })
  assert.equal(output.includes('blue-river-sunrise-42'), false, 'the password is never printed')
})

test('weak, mismatched or personal passwords are refused before anything is created', async () => {
  for (const [password, repeat, message] of [
    ['short', 'short', /at least 12 characters/],
    ['blue-river-sunrise-42', 'different-phrase-99', /do not match/],
    ['thandi.mokoena-2026!', 'thandi.mokoena-2026!', /must not contain the username/],
  ]) {
    const fake = await fakeSupabase()
    const { code, output } = await run(fake.url, [...good.slice(0, 3), password, repeat])
    fake.server.close()
    assert.equal(code, 1)
    assert.match(output, message)
    assert.equal(fake.calls.some((call) => call.method === 'POST'), false, 'nothing created')
  }
})

test('invalid usernames and taken usernames are refused', async () => {
  let fake = await fakeSupabase()
  let result = await run(fake.url, ['Thandi Mokoena', 'Thandi M', ...good.slice(2)])
  fake.server.close()
  assert.equal(result.code, 1)
  assert.match(result.output, /Usernames are 3–32 characters/)

  fake = await fakeSupabase({ takenUsernames: ['thandi.mokoena'] })
  result = await run(fake.url, good)
  fake.server.close()
  assert.equal(result.code, 1)
  assert.match(result.output, /already in use/)
  assert.equal(fake.calls.some((call) => call.url === '/auth/v1/admin/users'), false)
})

test('if the profile cannot be saved, the new login is removed again (no half-created accounts)', async () => {
  const fake = await fakeSupabase({ failProfileInsert: true })
  const { code, output } = await run(fake.url, good)
  fake.server.close()
  assert.equal(code, 1)
  assert.match(output, /login was removed again; nothing was created/)
  assert.ok(fake.calls.some((call) => call.method === 'DELETE' && call.url === '/auth/v1/admin/users/55555555-5555-4555-8555-555555555555'))
})

test('if the input ends early, the tool fails loudly instead of exiting as if it succeeded', async () => {
  const fake = await fakeSupabase()
  const { code, output } = await run(fake.url, good.slice(0, 2))
  fake.server.close()
  assert.equal(code, 1)
  assert.match(output, /Input ended before all details were entered/)
  assert.equal(fake.calls.some((call) => call.method === 'POST'), false)
})
