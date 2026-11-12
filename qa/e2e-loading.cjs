/*
 * Loading-state checks: spinners appear while content loads (API deliberately
 * slowed), disappear when it arrives, are accessible, and pulse instead of
 * spinning for people who prefer reduced motion.
 *
 *   cd frontend && npm run build && npx vite preview --port 4173 --strictPort &
 *   node qa/e2e-loading.cjs   (needs axe-core and playwright installed)
 */
const { chromium } = require('playwright')
const axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const results = []; const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? ' — ' + i : ''}`) }
;(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, bypassCSP: true })
  const slow = (ms, body) => async (route) => { await new Promise((r) => setTimeout(r, ms)); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }) }
  const vac = { vacancies: [{ id: 'a', title: 'Senior Accountant', location: 'Durban', region: 'KZN', category: 'Finance', employmentType: 'Permanent', isUrgent: true, closingDate: null, posted: '2026-11-01T00:00:00Z', applicationUrl: null, summary: 'x', responsibilities: ['y'] }] }
  for (const [path, label, shot] of [['/', 'Loading current vacancies…', 'home'], ['/careers', 'Loading vacancies…', 'careers']]) {
    const p = await ctx.newPage(); await p.route('**/api/**', slow(2500, vac)); await p.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '' + path)
    const spinner = p.getByRole('status').filter({ hasText: label }).first()
    await spinner.waitFor({ timeout: 2000 }); await spinner.scrollIntoViewIfNeeded()
    ok(`${path}: spinner with "${label}" shown while loading`, await spinner.isVisible())
    await p.addScriptTag({ content: axeSource })
    const v = await p.evaluate(async () => (await window.axe.run(document)).violations.map((x) => x.id))
    ok(`${path}: no accessibility issues while loading`, v.length === 0, v.join(','))
    
    await p.getByText('Senior Accountant').first().waitFor({ timeout: 5000 })
    ok(`${path}: spinner disappears once content arrives`, await p.getByText(label).count() === 0)
    await p.close()
  }
  { // staff sign-in button + workspace
    const p = await ctx.newPage()
    await p.route('**/api/**', async (route) => {
      const u = new URL(route.request().url()).pathname
      if (u === '/api/staff/login') return slow(1500, { accessToken: 'a.b.c', email: 's@i.co.za', displayName: 'Thandi Mokoena', expiresIn: 3600 })(route)
      return slow(300, u.includes('inquiries') ? { inquiries: [] } : vac)(route)
    })
    await p.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '/admin'); await p.fill('input[name=username]', 'thandi'); await p.fill('input[name=password]', 'pw'); await p.click('button.staff-access-submit')
    await p.waitForTimeout(300)
    ok('sign-in button shows an inline spinner', await p.locator('button.staff-access-submit .spinner__ring').count() === 1 && (await p.locator('button.staff-access-submit').innerText()).includes('Signing in'))
    
    await p.getByRole('heading', { name: 'Inventory' }).waitFor()
    await p.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '/admin/audit')
    ok('workspace shows a spinner while resuming the session', await p.getByText('Loading the staff workspace…').isVisible() || await p.getByText('Loading the audit log…').isVisible())
    await p.close()
  }
  { // reduced motion: pulse instead of spin
    const c2 = await b.newContext({ reducedMotion: 'reduce' }); const p = await c2.newPage(); await p.route('**/api/**', slow(2500, vac))
    await p.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '/careers'); await p.locator('.spinner__ring').first().waitFor()
    const anim = await p.locator('.spinner__ring').first().evaluate((el) => getComputedStyle(el).animationName)
    ok('reduced-motion users get a gentle pulse instead of spinning', anim === 'spinner-pulse', anim)
    await c2.close()
  }
  await b.close(); console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1)
})()
