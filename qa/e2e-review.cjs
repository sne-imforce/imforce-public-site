/*
 * Browser checks for /admin/review (advert approval) and /admin/notifications.
 * The API is stubbed with state, so review decisions change what the screens show.
 *
 *   cd frontend && npm run build && npx vite preview --port 4173 --strictPort &
 *   node qa/e2e-review.cjs              # set E2E_BASE_URL to test another host
 */
const { chromium, devices } = require('playwright')
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4173'
const results = []
const ok = (name, pass, info = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? ' — ' + info : ''}`) }

const DAY = 86_400_000
const now = Date.now()
const iso = (offsetDays) => new Date(now + offsetDays * DAY).toISOString()
const date = (offsetDays) => iso(offsetDays).slice(0, 10)
const id = (n) => `${(0x1a2b3c4d * n).toString(16).slice(-8).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`
const order = (n, title, company, paymentStatus, review_status = 'pending', extra = {}) => ({
  id: id(n), kind: 'employer', created_at: iso(-n), review_status,
  details: {
    legalName: company, tradingName: '', jobTitle: title, jobLocation: 'Durban', employmentType: 'Permanent',
    salary: 'ZAR 30 000 per month', closingDate: date(20), email: `hr${n}@company.co.za`,
    duties: 'Lead the finance team and close the books monthly.', requirements: 'IFRS knowledge\nAdvanced Excel', qualifications: 'BCom Accounting; 5 years experience',
    paymentStatus, paymentReference: `IMF-${n}`,
  },
  ...extra,
})

function fixtures() {
  return {
    inquiries: [
      order(1, 'Financial Manager', 'Acme Holdings', 'paid'),
      order(2, 'Payroll Clerk', 'Beta Foods', 'paid'),
      order(4, 'Driver', 'Gamma Logistics', 'pending'),
      order(8, 'Chef', 'Delta Hotels', 'paid', 'changes_requested', { reviewed_by_name: 'Sipho Dlamini', reviewed_at: iso(-7), review_reason: 'Please add the salary range.' }),
      order(9, 'Cashier', 'Epsilon Retail', 'paid', 'approved', { reviewed_by_name: 'Thandi Mokoena', reviewed_at: iso(-8), vacancy_id: 'v-approved' }),
      { id: id(20), kind: 'contact', created_at: iso(-0.2), name: 'Lerato Nkosi', email: 'lerato@example.com', enquiry_type: 'Job opportunities', subject: 'Looking for accounting work', message: 'Hello' },
      { id: id(21), kind: 'contact', created_at: iso(-30), name: 'Old Enquiry', email: 'old@example.com', enquiry_type: 'Other enquiry', subject: 'Old', message: 'Old' },
    ],
    vacancies: [
      { id: 'v-urgent', title: 'Night Shift Supervisor', clientName: 'Omega', location: 'Pietermaritzburg', region: 'KZN', category: 'Ops', employmentType: 'Permanent', isUrgent: true, closingDate: date(2), salary: '', posted: iso(-1), applicationUrl: null, summary: 's', responsibilities: ['r'], source: 'recruiter' },
      { id: 'v-closed', title: 'Receptionist', clientName: 'Zeta', location: 'Durban', region: 'KZN', category: 'Admin', employmentType: 'Contract', isUrgent: false, closingDate: date(-2), salary: '', posted: iso(-20), applicationUrl: null, summary: 's', responsibilities: ['r'], source: 'recruiter' },
    ],
    reviews: [],
  }
}

async function setup(page, state) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()); const p = url.pathname; const m = route.request().method()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (p === '/api/staff/login') return json({ accessToken: 'a.b.c', email: 'thandi@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi.mokoena', expiresIn: 3600 })
    if (p === '/api/staff/me') return json({ email: 'thandi@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi.mokoena' })
    if (p === '/api/staff/inquiries') return json({ inquiries: state.inquiries })
    if (p === '/api/staff/audit') return json({ entries: [] })
    const review = p.match(/^\/api\/staff\/job-orders\/([\w-]+)\/review$/)
    if (review && m === 'POST') {
      const body = route.request().postDataJSON(); state.reviews.push({ id: review[1], ...body })
      const target = state.inquiries.find((item) => item.id === review[1])
      const status = { approve: 'approved', changes: 'changes_requested', reject: 'rejected', reopen: 'pending' }[body.decision]
      Object.assign(target, { review_status: status, reviewed_by_name: status === 'pending' ? null : 'Thandi Mokoena', reviewed_at: status === 'pending' ? null : new Date().toISOString(), review_reason: body.reason ?? null })
      let vacancy = null
      if (body.decision === 'approve') { vacancy = { ...body.vacancy, id: `v-${review[1]}`, posted: new Date().toISOString(), source: 'recruiter' }; state.vacancies.push(vacancy); target.vacancy_id = vacancy.id }
      return json({ reviewStatus: status, vacancy })
    }
    if (p.startsWith('/api/staff/vacancies') || p === '/api/vacancies') return json({ vacancies: state.vacancies })
    return json({ error: 'Not found.' }, 404)
  })
  await page.goto(BASE + '/admin')
  await page.fill('input[name=username]', 'thandi.mokoena'); await page.fill('input[name=password]', 'pw'); await page.click('button.staff-access-submit')
  await page.getByRole('heading', { name: 'Inventory' }).waitFor()
}

const tab = (page, name) => page.locator('.admin__tab', { hasText: name })
const badge = async (page, name) => { const b = tab(page, name).locator('.admin__tab-badge'); return (await b.count()) ? (await b.innerText()).trim() : '0' }
const bodyRows = (page) => page.locator('tbody tr:not(.data-table__details-row):not(.data-table__empty-row)')

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  await context.addInitScript(() => localStorage.clear())
  const page = await context.newPage(); const state = fixtures()
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
  await setup(page, state)

  ok('five tabs in the workspace', await page.locator('.admin__tab').count() === 5, (await page.locator('.admin__tabs').innerText()).replace(/\s+/g, ' '))
  ok('Advert review tab shows 2 awaiting review', await badge(page, 'Advert review') === '2')
  ok('Notifications tab shows a count of new items', Number(await badge(page, 'Notifications')) > 0, await badge(page, 'Notifications'))
  ok('Inventory has an "Adverts awaiting review" tile', (await page.locator('.admin-stats').innerText()).includes('2\nAdverts awaiting review'))

  // --- Advert review -------------------------------------------------------
  await tab(page, 'Advert review').click(); await page.getByRole('heading', { name: 'Advert review' }).waitFor()
  ok('review queue opens filtered to "Awaiting review"', await bodyRows(page).count() === 2 && (await bodyRows(page).allInnerTexts()).every((t) => t.includes('Awaiting review')))
  ok('each job order shows an ORD- reference', (await bodyRows(page).first().innerText()).match(/ORD-[0-9A-F]{8}/) !== null)
  await page.getByRole('button', { name: 'Show details' }).first().click()
  ok('opening a job order shows its details and the three decisions', await page.getByRole('button', { name: /Approve & publish/ }).isVisible() && await page.getByRole('button', { name: 'Request changes' }).isVisible() && await page.getByRole('button', { name: 'Reject' }).isVisible())

  // Request changes
  await page.getByRole('button', { name: 'Request changes' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  ok('request-changes dialog needs a reason (button disabled until typed)', await dialog.getByRole('button', { name: 'Request changes' }).isDisabled())
  await dialog.locator('textarea').fill('Please add the working hours.')
  await dialog.getByRole('button', { name: 'Request changes' }).click()
  await dialog.waitFor({ state: 'hidden' })
  const changed = state.reviews.at(-1)
  ok('request changes is sent with the reason', changed?.decision === 'changes' && changed.reason === 'Please add the working hours.')
  ok('queue and badge update after the decision', await bodyRows(page).count() === 1 && await badge(page, 'Advert review') === '1')

  // Approve & publish
  await page.getByRole('button', { name: 'Show details' }).first().click()
  await page.getByRole('button', { name: /Approve & publish/ }).click()
  await page.getByRole('heading', { name: 'Approve & publish advert' }).waitFor()
  const value = (label) => page.getByLabel(label, { exact: true }).inputValue()
  // The first order (newest, Financial Manager) got 'request changes' above, so the next in the queue is Payroll Clerk.
  ok('approve opens the job post form pre-filled from the order', await value('Job title') === 'Payroll Clerk' && await value('Client company') === 'Beta Foods' && await value('Location') === 'Durban')
  ok('duties and requirements are pre-filled', (await page.getByLabel('Role summary').inputValue()).includes('Lead the finance team') && (await page.getByLabel('Key responsibilities (one per line)').inputValue()).split('\n').length >= 3)
  await page.getByLabel('Province / region').fill('KwaZulu-Natal')
  await page.getByLabel('Industry').selectOption({ index: 1 })
  await page.getByLabel('Job category').fill('Finance')
  await page.getByRole('button', { name: 'Approve & publish' }).click()
  await page.getByRole('heading', { name: 'Advert review' }).waitFor()
  const approved = state.reviews.at(-1)
  ok('approving sends the reviewed advert', approved?.decision === 'approve' && approved.vacancy?.title === 'Payroll Clerk' && approved.vacancy?.region === 'KwaZulu-Natal')
  ok('confirmation says the advert is live', await page.locator('.staff-access-snackbar').getByText('is now live').isVisible())
  ok('review badge clears when the queue is empty', await badge(page, 'Advert review') === '0')
  ok('empty queue shows a friendly message', await page.getByText('No results match your search or filters.').isVisible() || await page.getByText('Nothing is waiting right now').isVisible())

  // Unpaid orders cannot be approved
  await page.locator('select').first().selectOption('awaiting-payment')
  await page.getByRole('button', { name: 'Show details' }).first().click()
  ok('unpaid orders explain why they cannot be approved, offer reject only', await page.getByText('has not been paid yet').isVisible() && await page.getByRole('button', { name: /Approve/ }).count() === 0)

  // Changes requested: reason shown, can reopen
  await page.locator('select').first().selectOption('changes')
  const changesRow = bodyRows(page).filter({ hasText: 'Delta Hotels' })
  await changesRow.getByRole('button', { name: 'Show details' }).click()
  ok('changes-requested orders show reviewer and reason', await page.getByText('Please add the salary range.').isVisible() && await page.getByText(/by Sipho Dlamini/).isVisible())
  await page.getByRole('button', { name: 'Move back to review' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Move back to review' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ok('reopening puts it back in the queue', state.reviews.at(-1)?.decision === 'reopen' && await badge(page, 'Advert review') === '1')

  // --- Notifications ---------------------------------------------------------
  await tab(page, 'Notifications').click(); await page.getByRole('heading', { name: 'Notifications' }).waitFor()
  const feed = await page.locator('.notice-list').innerText()
  ok('feed shows adverts awaiting review', feed.includes('Advert awaiting review: Chef'))
  ok('feed shows urgent hires', feed.includes('Urgent hire: Night Shift Supervisor'))
  ok('feed shows new enquiries (not old ones)', feed.includes('New enquiry from Lerato Nkosi') && !feed.includes('Old Enquiry'))
  ok('feed shows reminders: closing soon, recently closed, unpaid follow-up', feed.includes('Closing soon: Night Shift Supervisor') && feed.includes('Closed: Receptionist') && feed.includes('Follow up payment: Gamma Logistics'))
  ok('items are marked New on the first visit', await page.locator('.notice.is-new').count() > 0)
  await page.getByRole('button', { name: /^Reminders/ }).click()
  ok('filter chips narrow the feed', (await page.locator('.notice').count()) === 3 && (await page.locator('.notice--reminder').count()) === 3)
  await page.getByRole('button', { name: /^All/ }).click()

  await page.locator('.notice', { hasText: 'Advert awaiting review: Chef' }).getByRole('link', { name: 'Review' }).click()
  await page.getByRole('heading', { name: 'Advert review' }).waitFor()
  ok('a notification link opens the exact job order, expanded', page.url().includes(`/admin/review?order=${id(8)}`) && await bodyRows(page).count() === 1 && await page.locator('.data-table__details-row').isVisible())
  ok('leaving notifications marks them as seen (badge cleared)', await badge(page, 'Notifications') === '0')

  await tab(page, 'Notifications').click(); await page.getByRole('heading', { name: 'Notifications' }).waitFor()
  ok('returning shows nothing new', await page.locator('.notice.is-new').count() === 0 && await page.getByText('You’re up to date.').isVisible())
  await page.locator('.notice', { hasText: 'New enquiry from Lerato Nkosi' }).getByRole('link', { name: 'View' }).click()
  await page.getByRole('heading', { name: 'Inventory' }).waitFor(); await page.waitForTimeout(400)
  ok('an enquiry notification opens that enquiry in the inventory', page.url().includes(`/admin?enquiry=${id(20)}`) && await page.locator('section[aria-labelledby="inventory-enquiries"] .data-table__details-row').getByText('Looking for accounting work').count() >= 0 && await page.locator('section[aria-labelledby="inventory-enquiries"] .data-table__details-row').isVisible())
  { // Two orders whose short references collide must still link to the right one.
    const twin = order(30, 'Twin Role A', 'Twin Co A', 'paid'); const twin2 = order(31, 'Twin Role B', 'Twin Co B', 'paid')
    twin.id = 'bbbbbbbb-0000-4000-8000-000000000030'; twin2.id = 'bbbbbbbb-0000-4000-8000-000000000031'
    state.inquiries.push(twin, twin2)
    await page.goto(`${BASE}/admin/review?order=${twin2.id}`); await page.getByRole('heading', { name: 'Advert review' }).waitFor(); await page.waitForTimeout(300)
    ok('links open the exact order even if short references collide', (await page.locator('.data-table__details-row').innerText()).includes('Twin Role B'))
  }
  ok('no JavaScript errors', errors.length === 0, errors.join(' | '))

  // Mobile layout
  const mobile = await browser.newContext({ ...devices['iPhone 13'] }); await mobile.addInitScript(() => localStorage.clear())
  const m = await mobile.newPage(); await setup(m, fixtures())
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok('mobile: five tabs fit without horizontal scrolling', overflow <= 1 && await m.locator('.admin__tab').count() === 5, `${overflow}px`)
  await tab(m, 'Notifications').click(); await m.getByRole('heading', { name: 'Notifications' }).waitFor()
  ok('mobile: notifications have no horizontal overflow', await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1)

  await browser.close()
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`)
  process.exit(results.every(Boolean) ? 0 : 1)
})()
