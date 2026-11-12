#!/usr/bin/env node
'use strict'
/*
 * Add an IMFORCE staff member (agent) who can sign in to /admin.
 *
 *   cd backend && npm run staff:create
 *
 * Records the agent's full name, username and email in staff_profiles / Supabase
 * Auth. The password is typed hidden, never passed on the command line (where it
 * would land in shell history) and never stored by IMFORCE: Supabase Auth keeps
 * only a one-way bcrypt hash. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * backend/.env (or the environment). The agent sets up their authenticator app
 * on first sign-in.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') })
const readline = require('node:readline')

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/

function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { apikey: serviceKey, 'Content-Type': 'application/json' }
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`
  let response
  try {
    response = await fetch(`${supabaseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error(`Could not reach Supabase at ${supabaseUrl}. Check SUPABASE_URL and your internet connection. Nothing was created.`)
  }
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!response.ok) throw Object.assign(new Error(data?.msg || data?.message || data?.error_description || `HTTP ${response.status}`), { status: response.status })
  return data
}

// Line reader that works both when someone types and when answers are piped in.
// When `hidden` and attached to a terminal, typed characters are not echoed.
function createPrompter() {
  const interactive = Boolean(process.stdin.isTTY)
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive })
  let muted = false
  if (interactive) {
    const write = rl._writeToOutput.bind(rl)
    rl._writeToOutput = (text) => { if (!muted) write(text) }
  }
  const lines = rl[Symbol.asyncIterator]()
  return {
    async ask(question, { hidden = false } = {}) {
      process.stdout.write(question)
      muted = hidden && interactive
      const { value, done } = await lines.next()
      if (muted) process.stdout.write('\n')
      muted = false
      if (done) fail('Input ended before all details were entered. Nothing was created.')
      return value
    },
    close: () => rl.close(),
  }
}

function checkPassword(password, { username, email }) {
  if (password.length < 12) return 'Use at least 12 characters. A short phrase of several words is easy to remember and strong.'
  if (password.length > 128) return 'Use no more than 128 characters.'
  const lower = password.toLowerCase()
  const localPart = email.split('@')[0]
  if (lower.includes(username) || (localPart.length >= 3 && lower.includes(localPart))) return 'The password must not contain the username or email.'
  if (/^(.)\1+$/.test(password) || ['password1234', '123456789012', 'imforce12345', 'qwertyuiop12'].includes(lower)) return 'That password is too easy to guess.'
  return ''
}

async function main() {
  if (!supabaseUrl || !serviceKey) fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env first.')
  const prompt = createPrompter()
  console.log('Add an IMFORCE staff member\n')

  const displayName = (await prompt.ask('Agent full name (shown in the workspace): ')).trim().replace(/\s+/g, ' ')
  if (displayName.length < 2 || displayName.length > 80) fail('Enter the agent’s name (2 to 80 characters).')

  const username = (await prompt.ask('Username (used to sign in, e.g. thandi.mokoena): ')).trim().toLowerCase()
  if (!usernamePattern.test(username)) fail('Usernames are 3–32 characters: lowercase letters, numbers, dots, hyphens or underscores, starting with a letter or number.')

  const email = (await prompt.ask('Work email: ')).trim().toLowerCase()
  if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) fail('Enter a valid email address.')

  const password = await prompt.ask('Password (hidden): ', { hidden: true })
  const problem = checkPassword(password, { username, email })
  if (problem) fail(problem)
  const repeat = await prompt.ask('Repeat password (hidden): ', { hidden: true })
  prompt.close()
  if (repeat !== password) fail('The passwords do not match.')

  const taken = await api(`/rest/v1/staff_profiles?username=eq.${encodeURIComponent(username)}&select=user_id`)
  if (taken.length) fail(`The username “${username}” is already in use.`)

  let user
  try {
    user = await api('/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password, email_confirm: true, user_metadata: { display_name: displayName } },
    })
  } catch (error) {
    fail(`Supabase did not create the login: ${error.message}`)
  }

  try {
    await api('/rest/v1/staff_profiles', {
      method: 'POST',
      body: { user_id: user.id, username, display_name: displayName, active: true },
    })
  } catch (error) {
    // Do not leave a login without a staff profile behind.
    try { await api(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' }) } catch { /* reported below */ }
    fail(`The staff profile could not be saved (${error.message}). The login was removed again; nothing was created.`)
  }

  console.log(`\n✔ ${displayName} can now sign in at /admin with the username “${username}”.`)
  console.log('  On their first sign-in they will scan a QR code with an authenticator app.')
}

main().catch((error) => fail(error.message))
