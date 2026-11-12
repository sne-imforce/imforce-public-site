/*
 * "Request changes" end to end in the browser: the employer's private update page
 * and the staff side (emailed / copy-link fallback / resend / resubmitted).
 * The API is stubbed with state.
 *
 *   cd frontend && npm run build && npx vite preview --port 4173 --strictPort &
 *   node qa/e2e-changes.cjs   (needs playwright; axe-core optional)
 */
const { chromium, devices } = require('playwright')
let axeSource = null
try { axeSource = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') } catch { /* optional */ }
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173'
const results = []
const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`) }

const TOKEN = 'Abc_def-ghijklmnopqrstuvwxyz0123456789ABCDE' // 43 characters, like the real token
const DAY = 86_400_000
const iso = (days) => new Date(Date.now() + days * DAY).toISOString()
const orderDetails = {
  legalName: 'Acme Holdings', tradingName: '', registrationNumber: '2020/123456/07', vatNumber: '', companyAddress: '1 Main Road, Durban',
  contactName: 'Thandi Mokoena', phone: '+27 31 555 0100', billingContact: 'Accounts', billingAddress: '1 Main Road, Durban',
  jobTitle: 'Financial Manager', jobLocation: 'Durban', numberOfHires: '1', employmentType: 'Permanent', workingHours: 'Mon-Fri 08:00-17:00',
  salary: 'Market related', closingDate: iso(20).slice(0, 10), duties: 'Lead the finance team and close the books every month on time.',
  requirements: 'IFRS knowledge and advanced Excel skills', qualifications: 'BCom Accounting, 5 years', email: 'hr@acme.co.za',
}

async function employerPage(page, state, hash = `#token=${TOKEN}`) {
  state.requests = []
  await page.route('**/api/**', async (route) => {
    const url = route.request().url(); state.requests.push({ url, body: route.request().postData() || '' })
    const p = new URL(url).pathname
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (p === '/api/job-order-changes/open') {
      const { token } = route.request().postDataJSON()
      if (token !== TOKEN || state.used) return json({ error: 'This link is invalid, has expired or has already been used. Ask IMFORCE to send you a new one.' }, 404)
      return json({ reference: 'ORD-1A2B3C4D', reason: 'Please add the salary range and the working hours for Saturdays.', requestedAt: iso(-1), expiresAt: iso(6), details: orderDetails })
    }
    if (p === '/api/job-order-changes/submit') {
      const body = route.request().postDataJSON(); state.submitted = body
      if (!body.details.authorizedContact) return json({ error: 'Please correct these job order details.', errors: [{ field: 'authorizedContact', message: 'Confirm that you are authorized to share these job details with IMFORCE.' }] }, 400)
      if (body.details.salary === 'Market related') return json({ error: 'Please correct these job order details.', errors: [{ field: 'salary', message: 'Enter the salary range IMFORCE asked for.' }] }, 400)
      state.used = true
      return json({ ok: true, reference: 'ORD-1A2B3C4D' })
    }
    return json({ vacancies: [] })
  })
  await page.goto(`${BASE}/employers/update-job-order${hash}`)
}

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, bypassCSP: true })

  // --- Employer: private update page ---------------------------------------
  {
    const page = await context.newPage(); const state = {}
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
    await employerPage(page, state)
    await page.getByText('What IMFORCE asked you to change').waitFor()
    ok('the private token is removed from the address bar immediately', !page.url().includes('#') && !page.url().includes(TOKEN), page.url())
    ok('the token is sent only in the request body, never in a URL', state.requests.every((request) => !request.url.includes(TOKEN)) && state.requests.some((request) => request.body.includes(TOKEN)))
    ok('shows what IMFORCE asked to change', await page.getByText('Please add the salary range and the working hours for Saturdays.').isVisible())
    ok('form is pre-filled with the original job order', await page.getByLabel('Job title *').inputValue() === 'Financial Manager' && await page.getByLabel('Salary or salary range *').inputValue() === 'Market related')
    ok('contact email is shown but cannot be changed', await page.getByLabel('Contact email').getAttribute('readonly') !== null)
    ok('page says the link expires and must not be forwarded', await page.getByText(/expires on .* Do not forward it/).isVisible())
    if (axeSource) {
      await page.addScriptTag({ content: axeSource })
      const violations = await page.evaluate(async () => (await window.axe.run(document)).violations.map((v) => v.id))
      ok('update page has no accessibility issues', violations.length === 0, violations.join(', '))
    }
    await page.getByRole('button', { name: 'Send my changes for review' }).click()
    await page.locator('#update-errors').waitFor()
    ok('without the confirmation box, the employer is told what to fix', await page.getByText('Confirm that you are authorized').first().isVisible())
    await page.getByLabel(/I confirm I am allowed/).check()
    await page.getByRole('button', { name: 'Send my changes for review' }).click()
    await page.getByText('Enter the salary range IMFORCE asked for.').first().waitFor()
    ok('field errors appear next to the field', await page.locator('#error-salary').isVisible())
    ok('what they typed is kept after an error', await page.getByLabel('Job title *').inputValue() === 'Financial Manager')
    await page.getByLabel('Salary or salary range *').fill('ZAR 40 000 - 45 000 per month')
    await page.getByRole('button', { name: 'Send my changes for review' }).click()
    await page.getByRole('heading', { name: 'Thank you. Your job order is back with our team.' }).waitFor()
    ok('success message after sending the changes', true)
    ok('the email address and payment data are never sent from the page', !('email' in state.submitted.details) && !JSON.stringify(state.submitted).includes('payment'))
    ok('the changed salary was submitted', state.submitted.details.salary === 'ZAR 40 000 - 45 000 per month')
    ok('no JavaScript errors on the update page', errors.length === 0, errors.join(' | '))
    await page.close()
  }
  {
    const page = await context.newPage(); const state = { used: true }
    await employerPage(page, state)
    await page.getByRole('heading', { name: 'This link can’t be used' }).waitFor()
    ok('a used or expired link explains how to get a new one', await page.getByText('Links work once and expire after 7 days').isVisible())
    await page.close()
  }
  {
    const page = await context.newPage()
    await employerPage(page, {}, '')
    await page.getByRole('heading', { name: 'This link can’t be used' }).waitFor()
    ok('opening the page without a link explains what is needed (no API call)', await page.getByText('needs the private link from your IMFORCE email').isVisible())
    await page.close()
  }
  {
    const mobile = await browser.newContext({ ...devices['iPhone 13'] }); const page = await mobile.newPage()
    await employerPage(page, {})
    await page.getByText('What IMFORCE asked you to change').waitFor()
    ok('update page fits a phone screen', await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1)
    await mobile.close()
  }

  // --- Staff: request changes, copy-link fallback, resend, resubmitted ------
  const staffState = {
    emailMode: 'sent', reviews: [], resends: 0,
    inquiries: [
      { id: '11111111-0000-4000-8000-000000000001', kind: 'employer', created_at: iso(-1), review_status: 'pending', details: { ...orderDetails, paymentStatus: 'paid' } },
      { id: '22222222-0000-4000-8000-000000000002', kind: 'employer', created_at: iso(-3), review_status: 'pending', details: { ...orderDetails, legalName: 'Beta Foods', jobTitle: 'Payroll Clerk', paymentStatus: 'paid', resubmittedAt: iso(-0.1), lastChangeRequest: 'Please add the working hours.' } },
    ],
  }
  const staff = await context.newPage()
  await staff.route('**/api/**', async (route) => {
    const p = new URL(route.request().url()).pathname; const m = route.request().method()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const linkResult = () => (staffState.emailMode === 'sent'
      ? { emailStatus: 'sent', sentTo: 'hr@acme.co.za', expiresAt: iso(7), link: null }
      : { emailStatus: 'not_configured', sentTo: 'hr@acme.co.za', expiresAt: iso(7), link: `https://www.imforce.co.za/employers/update-job-order#token=${TOKEN}` })
    if (p === '/api/staff/login') return json({ accessToken: 'a.b.c', email: 's@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi' })
    if (p === '/api/staff/inquiries') return json({ inquiries: staffState.inquiries })
    const review = p.match(/^\/api\/staff\/job-orders\/([\w-]+)\/review$/)
    if (review && m === 'POST') {
      const body = route.request().postDataJSON(); const order = staffState.inquiries.find((item) => item.id === review[1])
      Object.assign(order, { review_status: 'changes_requested', review_reason: body.reason, reviewed_by_name: 'Thandi Mokoena', reviewed_at: new Date().toISOString(), change_request: { reason: body.reason, requested_at: new Date().toISOString(), expires_at: iso(7), email_status: staffState.emailMode, emailed_at: staffState.emailMode === 'sent' ? new Date().toISOString() : null, responded_at: null, revoked_at: null } })
      return json({ reviewStatus: 'changes_requested', vacancy: null, changeLink: linkResult() })
    }
    if (/\/change-link$/.test(p)) { staffState.resends += 1; return json({ changeLink: linkResult() }) }
    return json({ vacancies: [] })
  })
  await staff.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await staff.goto(`${BASE}/admin`)
  await staff.fill('input[name=username]', 'thandi'); await staff.fill('input[name=password]', 'pw'); await staff.click('button.staff-access-submit')
  await staff.getByRole('heading', { name: 'Inventory' }).waitFor()
  await staff.locator('.admin__tab', { hasText: 'Advert review' }).click(); await staff.getByRole('heading', { name: 'Advert review' }).waitFor()

  const resubmitted = staff.locator('tbody tr', { hasText: 'Beta Foods' }).first()
  ok('resubmitted orders are marked "Updated by employer"', await resubmitted.getByText('Updated by employer').isVisible())
  await resubmitted.getByRole('button', { name: 'Show details' }).click()
  ok('resubmitted orders show what was asked (once)', await staff.getByText('Please add the working hours.').count() === 1 && await staff.locator('blockquote', { hasText: 'Please add the working hours.' }).isVisible() && await staff.getByText(/The employer updated this job order on/).isVisible())
  await resubmitted.getByRole('button', { name: 'Hide details' }).click()

  const acme = () => staff.locator('tbody tr', { hasText: 'Acme Holdings' }).first()
  await acme().getByRole('button', { name: 'Show details' }).click()
  await staff.getByRole('button', { name: 'Request changes' }).click()
  await staff.getByRole('dialog').locator('textarea').fill('Please add the salary range.')
  await staff.getByRole('dialog').getByRole('button', { name: 'Request changes' }).click()
  await staff.locator('.staff-access-snackbar').waitFor()
  ok('when the email is sent, staff are told who was emailed', (await staff.locator('.staff-access-snackbar').innerText()).includes('emailed a private link at hr@acme.co.za'))

  await staff.locator('select').first().selectOption('changes')
  // The row may still be open from the previous step.
  if (await acme().getByRole('button', { name: 'Show details' }).count()) await acme().getByRole('button', { name: 'Show details' }).click()
  ok('changes-requested orders show the link status', await staff.getByText(/Update link: Emailed to hr@acme.co.za/).isVisible())

  staffState.emailMode = 'not_configured'
  await staff.getByRole('button', { name: 'Send a new link' }).click()
  const linkDialog = staff.getByRole('dialog', { name: 'Send the update link to the employer' })
  await linkDialog.waitFor()
  ok('without email, staff get the link to send themselves', (await linkDialog.locator('input').inputValue()).includes('/employers/update-job-order#token='))
  ok('the dialog warns the link is private and expires', await linkDialog.getByText(/works once and expires on/).isVisible())
  await linkDialog.getByRole('button', { name: 'Copy link' }).click()
  await linkDialog.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 5000 }).catch(() => {})
  ok('"Copy link" copies it', await linkDialog.getByRole('button', { name: 'Copied' }).isVisible() && (await staff.evaluate(() => navigator.clipboard.readText())).includes('#token='))
  ok('"Send a new link" calls the API', staffState.resends === 1)
  await linkDialog.getByRole('button', { name: 'Done' }).click()

  await staff.locator('.admin__tab', { hasText: 'Notifications' }).click(); await staff.getByRole('heading', { name: 'Notifications' }).waitFor()
  ok('Notifications show "Employer updated their advert"', await staff.getByText('Employer updated their advert: Payroll Clerk').isVisible())

  await browser.close()
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  process.exit(results.every(Boolean) ? 0 : 1)
})()
