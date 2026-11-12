/*
 * Browser end-to-end smoke and security checks (Playwright, Chromium).
 * Runs against a production build with the API stubbed at the network layer.
 *
 *   cd frontend && npm run build && npx vite preview --port 4173 --strictPort &
 *   npm install --no-save playwright   # if Playwright is not already available
 *   node qa/e2e-smoke.cjs              # set E2E_BASE_URL to test another host
 */
const { chromium, devices } = require('playwright')
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173'
const routes = ['/', '/about', '/careers', '/contact', '/employers', '/services/placements', '/certifications', '/fee-calculator', '/admin']
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`) }

const trapHidden = (page) => page.evaluate(() => {
  const i = document.querySelector('input[name="extraNotesHp"]'); if (!i) return false
  i.scrollIntoView(); const box = i.getBoundingClientRect(); const label = i.closest('label'); const lb = label.getBoundingClientRect()
  const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
  return lb.width <= 1 && lb.height <= 1 && !(hit === i || label.contains(hit)) && i.tabIndex === -1 && label.getAttribute('aria-hidden') === 'true'
})
async function stubApi(page, opts = {}) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname; const m = route.request().method()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (p === '/api/vacancies') return json({ vacancies: [{ id: 'a', title: 'Bad Link Role', location: 'Durban', region: 'KZN', category: 'Admin', employmentType: 'Permanent', isUrgent: false, closingDate: null, posted: '2026-11-01T00:00:00Z', applicationUrl: 'javascript:alert(1)', summary: 'Role', responsibilities: ['x'] }] })
    if (p === '/api/contact' && m === 'POST') { opts.contactBody = route.request().postDataJSON(); return opts.contactFails ? json({ error: 'We could not save your enquiry. Please try again.' }, 502) : json({ ok: true, reference: 'ENQ-1A2B3C4D' }, 201) }
    if (p === '/api/staff/login') { opts.loginCalls = (opts.loginCalls || 0) + 1; opts.loginBody = route.request().postDataJSON(); await new Promise(r => setTimeout(r, 400)); return json({ accessToken: 'a.b.c', email: 'staff@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi.mokoena', expiresIn: 3600 }) }
    if (p === '/api/staff/vacancies') return opts.expire ? json({ error: 'Your session is invalid or expired. Sign in again.' }, 401) : json({ vacancies: [] })
    if (p === '/api/staff/inquiries') return json({ inquiries: [{ id: '1', kind: 'contact', created_at: '2026-11-10T10:00:00Z', name: 'Lerato', email: 'l@x.co', phone: '082', enquiry_type: 'Job opportunities', subject: 'Hi', message: '<img src=x onerror=alert(1)>' }] })
    if (p === '/api/staff/logout') { opts.logout = true; return json({ ok: true }) }
    if (p === '/api/staff/me') return json({ email: 'staff@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi.mokoena' })
    return json({ error: 'Not found.' }, 404)
  })
}

;(async () => {
  const browser = await chromium.launch()
  for (const [label, ctxOpts] of [['desktop', { viewport: { width: 1366, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
    const context = await browser.newContext(ctxOpts)
    for (const route of routes) {
      const page = await context.newPage(); await stubApi(page)
      const errors = []
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.goto(BASE + route, { waitUntil: 'networkidle' })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      const csp = errors.filter((e) => /Content Security Policy/i.test(e))
      ok(`[${label}] ${route} loads without CSP violations`, csp.length === 0, csp.join(' | ').slice(0, 200))
      ok(`[${label}] ${route} no JS errors`, errors.length === 0, errors.join(' | ').slice(0, 200))
      ok(`[${label}] ${route} no horizontal overflow`, overflow <= 1, `overflow ${overflow}px`)
      if (route === '/admin') {
        const robots = await page.locator('meta[name="robots"]').getAttribute('content')
        ok(`[${label}] /admin is noindex`, robots.startsWith('noindex'), robots)
      }
      if (label === 'desktop' && route === '/careers') {
        await page.getByText('Bad Link Role').first().click().catch(() => {})
        const jsLinks = await page.locator('a[href^="javascript:"]').count()
        ok('[desktop] careers never renders javascript: apply links', jsLinks === 0, `${jsLinks} found`)
      }
      await page.close()
    }
    await context.close()
  }

  // Contact form flow
  {
    const page = await browser.newPage(); const state = {}; await stubApi(page, state)
    await page.goto(BASE + '/contact')
    const trapOk = await trapHidden(page)
    await page.fill('input[name="name"]', 'Lerato'); await page.fill('input[name="email"]', 'lerato@example.com')
    await page.selectOption('select[name="enquiryType"]', 'Job opportunities')
    await page.fill('input[name="subject"]', 'Looking for work'); await page.fill('textarea[name="message"]', 'Hello there')
    await page.click('button[type="submit"]'); await page.waitForTimeout(500)
    ok('contact confirmation greets the visitor by first name', await page.getByRole('heading', { name: 'Thank you, Lerato. Your message has been sent.' }).isVisible())
    ok('confirmation receives focus (announced to screen readers)', await page.evaluate(() => document.activeElement?.id) === 'contact-form-title')
    ok('confirmation shows reply email and reference', await page.getByText('lerato@example.com').isVisible() && await page.getByText('ENQ-1A2B3C4D').isVisible())
    ok('next steps match a job seeker', await page.getByRole('link', { name: 'Browse current vacancies' }).isVisible() && await page.getByText('What happens next').isVisible())
    ok('form is replaced by the confirmation (no duplicate sends)', await page.locator('form.contact-form').count() === 0)
    await page.getByRole('button', { name: 'Send another message' }).click()
    ok('"Send another message" brings back an empty form', await page.locator('form.contact-form').count() === 1 && await page.inputValue('input[name="name"]') === '')
    state.contactFails = true
    await page.fill('input[name="name"]', 'Lerato'); await page.fill('input[name="email"]', 'lerato@example.com')
    await page.selectOption('select[name="enquiryType"]', 'Hiring and permanent staffing')
    await page.fill('input[name="subject"]', 'Hiring'); await page.fill('textarea[name="message"]', 'Hello')
    await page.click('button[type="submit"]'); await page.getByRole('alert').waitFor()
    ok('a failed send shows a red alert with a phone fallback, and keeps the typed message', (await page.getByRole('alert').innerText()).includes('033 492 0600') && await page.inputValue('textarea[name="message"]') === 'Hello')
    ok('contact payload carries empty bot-trap field and no legacy _subject', state.contactBody?.extraNotesHp === '' && !('_subject' in state.contactBody), JSON.stringify(Object.keys(state.contactBody || {})))
    ok('bot-trap field is invisible to people', trapOk)
    await page.close()
  }

  // Employer form trap present & hidden
  {
    const page = await browser.newPage(); await stubApi(page)
    await page.goto(BASE + '/employers')
    ok('employer form has hidden bot-trap field', await trapHidden(page))
    await page.close()
  }

  // Staff login: loading state, double submit, XSS-safe rendering, logout revokes, session expiry
  {
    const page = await browser.newPage(); const state = {}; await stubApi(page, state)
    let dialog = false; page.on('dialog', async (d) => { dialog = true; await d.dismiss() })
    await page.goto(BASE + '/admin')
    await page.fill('input[name="username"]', 'thandi.mokoena'); await page.fill('input[name="password"]', 'pw')
    const btn = page.locator('button.staff-access-submit')
    await btn.click(); await btn.click({ force: true, timeout: 200 }).catch(() => {})
    ok('login button shows busy state', /Signing in/.test(await btn.textContent()))
    await page.getByRole('heading', { name: 'Inventory' }).waitFor()
    ok('double-click sends only one login request', state.loginCalls === 1, `calls=${state.loginCalls}`)
    ok('header greets the agent by name, not email', (await page.locator('.admin__signed-in').innerText()).trim() === 'Signed in as Thandi Mokoena')
    ok('login asked for a username, not an email', state.loginBody?.username === 'thandi.mokoena' && !('email' in (state.loginBody || {})))
    await page.getByRole('button', { name: 'Show details' }).first().click()
    { const details = page.locator('.data-table__details-row'); ok('enquiry shows name/phone/type', await details.getByText('Lerato').isVisible() && await details.getByText('082').isVisible() && await details.getByText('Job opportunities').isVisible()) }
    ok('stored XSS in enquiry is rendered as text', !dialog && await page.getByText('<img src=x onerror=alert(1)>').isVisible())
    const tokenStored = await page.evaluate(() => [sessionStorage.getItem('imforce-staff-access-token'), localStorage.getItem('imforce-staff-access-token')])
    ok('token in sessionStorage only', tokenStored[0] === 'a.b.c' && tokenStored[1] === null)
    await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForTimeout(200)
    ok('sign out calls server logout and clears token', state.logout === true && await page.evaluate(() => sessionStorage.getItem('imforce-staff-access-token')) === null)

    // session expiry handling
    await page.fill('input[name="username"]', 'thandi.mokoena'); await page.fill('input[name="password"]', 'pw')
    await page.click('button.staff-access-submit'); await page.getByRole('heading', { name: 'Inventory' }).waitFor()
    state.expire = true
    await page.evaluate(() => { sessionStorage.setItem('imforce-staff-access-expires', String(Date.now() - 1)) })
    await page.goto(BASE + '/admin'); await page.waitForTimeout(300)
    ok('expired token is not reused after reload', await page.locator('input[name="password"]').isVisible())
    
    await page.close()
  }
  // Two-step (MFA) staff sign-in
  {
    const page = await browser.newPage()
    let verifyCalls = 0
    await page.route('**/api/**', async (route) => {
      const p = new URL(route.request().url()).pathname
      const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (p === '/api/staff/login') return json({ mfa: { step: 'enroll', ticket: 'a.b.c', factorId: '11111111-1111-4111-8111-111111111111', qrCode: 'data:image/svg+xml;utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E', secret: 'JBSWY3DPEHPK3PXP' } })
      if (p === '/api/staff/mfa/verify') { verifyCalls += 1; return route.request().postDataJSON().code === '123456' ? json({ accessToken: 'x.y.z', email: 'staff@imforce.co.za', expiresIn: 3600 }) : json({ error: 'That code is not correct. Codes change every 30 seconds, so check your authenticator app and try again.' }, 401) }
      if (p === '/api/staff/inquiries') return json({ inquiries: [] })
      return json({ vacancies: [] })
    })
    await page.goto(BASE + '/admin')
    await page.fill('input[name="username"]', 'thandi.mokoena'); await page.fill('input[name="password"]', 'secret-password')
    await page.click('button.staff-access-submit')
    await page.getByText('Set up two-step sign-in').waitFor()
    ok('MFA: password is not carried into the code field', await page.inputValue('input[name="code"]') === '' && await page.locator('input[name="password"]').count() === 0)
    ok('MFA: code field is focused', await page.evaluate(() => document.activeElement?.getAttribute('name')) === 'code')
    ok('MFA: QR code and setup key shown', await page.locator('img.staff-mfa__qr').count() === 1 && await page.getByText('JBSWY3DPEHPK3PXP').isVisible())
    await page.fill('input[name="code"]', '000000'); await page.click('button.staff-access-submit'); await page.getByRole('alert').waitFor()
    ok('MFA: wrong code keeps the user on the code step', await page.locator('input[name="code"]').count() === 1)
    await page.fill('input[name="code"]', '123 456'); await page.click('button.staff-access-submit')
    await page.getByRole('heading', { name: 'Inventory' }).waitFor()
    ok('MFA: correct code (with a space) signs in', verifyCalls === 2)
    await page.close()
  }
  await browser.close()
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
})()
