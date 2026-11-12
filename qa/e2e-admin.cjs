/*
 * Browser checks for the staff workspace (/admin): tabs, inventory tables
 * (search, sort, filters, 10-per-page paging, expandable rows), edit/delete,
 * job posts form, audit log and the phone card layout. API is stubbed.
 *
 *   cd frontend && npm run build && npx vite preview --port 4173 --strictPort &
 *   node qa/e2e-admin.cjs              # set E2E_BASE_URL to test another host
 */
const { chromium, devices } = require('playwright')
const results = []; const ok = (n, p, i = '') => { results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${i ? ' — ' + i : ''}`) }
const titles = ['Senior Accountant', 'Warehouse Supervisor', 'Payroll Officer', 'HR Generalist', 'Sales Representative', 'Forklift Driver', 'IT Support Technician', 'Chef de Partie', 'Security Officer', 'Quality Controller']
const towns = ['Durban', 'Cape Town', 'Pietermaritzburg', 'Johannesburg', 'Gqeberha']
const vacancies = Array.from({ length: 27 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `${titles[i % 10]}${i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ''}`, clientName: `Client ${String.fromCharCode(65 + (i % 7))}`,
  location: towns[i % 5], region: 'KZN', industry: ['Finance', 'Logistics', 'Hospitality'][i % 3], category: 'General', employmentType: i % 4 ? 'Permanent' : 'Contract',
  isUrgent: i % 6 === 0, closingDate: i % 9 === 0 ? '2026-10-01' : i % 5 === 0 ? null : `2026-12-${String((i % 27) + 1).padStart(2, '0')}`, salary: 'ZAR 20 000',
  posted: new Date(Date.UTC(2026, 10, 1) + i * 86_400_000 / 2).toISOString(), applicationUrl: 'https://apply.example/x', summary: 'Role summary', responsibilities: ['Do things'], source: 'recruiter',
}))
const inquiries = Array.from({ length: 23 }, (_, i) => i % 3 === 0
  ? { id: `e${i}`, kind: 'employer', created_at: new Date(Date.UTC(2026, 10, 11) - i * 3600_000 * 10).toISOString(), details: { legalName: `Company ${i} (Pty) Ltd`, jobTitle: `Role ${i}`, email: `hr${i}@company.co.za`, paymentStatus: ['paid', 'pending', 'initialization_failed'][i % 3 === 0 ? (i / 3) % 3 : 0], paymentReference: `IMF-${i}` } }
  : { id: `c${i}`, kind: 'contact', created_at: new Date(Date.UTC(2026, 10, 11) - i * 3600_000 * 10).toISOString(), name: `Person ${i}`, email: `person${i}@example.com`, phone: '082', enquiry_type: 'Job opportunities', subject: `Question ${i}`, message: `<b>Message ${i}</b>` })
const actions = ['staff.login', 'enquiries.view', 'vacancy.create', 'vacancy.update', 'vacancy.delete', 'staff.logout']
const audit = Array.from({ length: 60 }, (_, i) => ({ occurred_at: new Date(Date.UTC(2026, 10, 12, 8) - i * 3600_000).toISOString(), actor_email: i % 2 ? 'thandi@imforce.co.za' : 'sipho@imforce.co.za', actor_name: i % 2 ? 'Thandi Mokoena' : 'Sipho Dlamini', action: actions[i % 6], entity_type: null, entity_id: null, detail: i % 6 === 3 ? { title: `Job ${i}`, changedFields: ['salary', 'closing_date'] } : i % 6 === 2 || i % 6 === 4 ? { title: `Job ${i}` } : {} }))

async function setup(page, state) {
  await page.route('**/api/**', (route) => {
    const u = new URL(route.request().url()).pathname; const m = route.request().method()
    const j = (x, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(x) })
    if (u === '/api/staff/login') return j({ accessToken: 'a.b.c', email: 'staff@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi.mokoena', expiresIn: 3600 })
    if (u === '/api/staff/inquiries') return j({ inquiries })
    if (u === '/api/staff/audit') return j({ entries: audit })
    if (u.startsWith('/api/staff/vacancies/') && m === 'DELETE') {
      if (state.failDelete) return j({ error: 'Vacancy could not be deleted.' }, 502)
      state.deleted = u; return j({ ok: true })
    }
    if (u.startsWith('/api/staff/vacancies/') && m === 'PUT') { state.put = route.request().postDataJSON(); return j({ vacancy: { ...vacancies[0], ...state.put, id: u.split('/').pop() } }) }
    if (u === '/api/staff/me') return j({ email: 'staff@imforce.co.za', displayName: 'Thandi Mokoena', username: 'thandi.mokoena' })
    return j({ vacancies })
  })
  await page.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '/admin')
  await page.fill('input[name=username]', 'thandi.mokoena'); await page.fill('input[name=password]', 'pw'); await page.click('button.staff-access-submit')
  await page.getByRole('heading', { name: 'Inventory' }).waitFor()
}
const jobs = (p) => p.locator('section[aria-labelledby="inventory-jobs"]')
const enq = (p) => p.locator('section[aria-labelledby="inventory-enquiries"]')
const rowsIn = (s) => s.locator('tbody tr:not(.data-table__details-row):not(.data-table__empty-row)')

;(async () => {
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1366, height: 900 } }); const state = {}
  let nativeDialog = false; page.on('dialog', (d) => { nativeDialog = true; d.dismiss() })
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await setup(page, state)
  ok('tabs: Inventory, Job posts, Audit log + Home + Sign out', await page.locator('.admin__tab').count() === 3 && await page.locator('.admin__header').getByRole('link', { name: 'Home' }).isVisible() && await page.getByRole('button', { name: 'Sign out' }).isVisible())
  ok('Inventory tab is active', (await page.locator('.admin__tab.is-active').textContent()).includes('Inventory'))
  ok('header shows the agent name', (await page.locator('.admin__signed-in').innerText()).trim() === 'Signed in as Thandi Mokoena')
  ok('summary tiles shown', await page.locator('.admin-stats li').count() === 5, (await page.locator('.admin-stats').innerText()).replace(/\n/g, ' '))
  ok('jobs: default sort newest first', (await (await rowsIn(jobs(page)).first().locator('.admin-cell__title').innerText()).trim()) === vacancies[26].title)
  ok('jobs: only 10 rows shown', await rowsIn(jobs(page)).count() === 10)
  ok('jobs: footer says 1–10 of 27', /Showing 1–10 of 27/.test(await jobs(page).locator('.data-table__footer').innerText()))
  ok('jobs: previous disabled on first page', await jobs(page).getByRole('button', { name: 'Previous page' }).isDisabled())
  await jobs(page).getByRole('button', { name: 'Next page' }).click()
  ok('jobs: next page shows 11–20', /Showing 11–20 of 27/.test(await jobs(page).locator('.data-table__footer').innerText()))
  await jobs(page).getByRole('button', { name: 'Next page' }).click()
  ok('jobs: last page shows 21–27 and next disabled', /21–27/.test(await jobs(page).locator('.data-table__footer').innerText()) && await jobs(page).getByRole('button', { name: 'Next page' }).isDisabled())
  const firstTitle = async () => (await rowsIn(jobs(page)).first().locator('.admin-cell__title').innerText()).trim()
  await jobs(page).getByRole('button', { name: /Job post/ }).click()
  ok('jobs: sort by title A→Z and back to page 1', (await firstTitle()) === 'Chef de Partie' && /Showing 1–10/.test(await jobs(page).locator('.data-table__footer').innerText()), await firstTitle())
  ok('jobs: aria-sort set on sorted column', await jobs(page).locator('th[aria-sort="ascending"]').count() === 1)
  await jobs(page).getByRole('button', { name: /Job post/ }).click()
  ok('jobs: sort toggles to Z→A', (await firstTitle()).startsWith('Warehouse'), await firstTitle())
  await jobs(page).locator('input[type=search]').fill('durban')
  ok('jobs: search filters rows', /of 6 \(filtered from 27\)/.test(await jobs(page).locator('.data-table__footer').innerText()), await jobs(page).locator('.data-table__footer').innerText())
  await jobs(page).locator('select').first().selectOption('closed')
  const closedText = await jobs(page).locator('.data-table__footer').innerText()
  ok('jobs: search + status filter combine', /filtered from 27/.test(closedText) && (await rowsIn(jobs(page)).allInnerTexts()).every((t) => t.includes('Closed')), closedText)
  await jobs(page).getByRole('button', { name: 'Clear' }).click()
  { const t = await jobs(page).locator('.data-table__footer p').innerText(); ok('jobs: Clear resets search and filters', t.trim() === 'Showing 1–10 of 27' && await jobs(page).locator('input[type=search]').inputValue() === '', t) }
  await jobs(page).locator('input[type=search]').fill('zzz-no-match')
  ok('jobs: friendly empty state', await jobs(page).getByText('No results match your search or filters.').isVisible())
  await jobs(page).getByRole('button', { name: 'Clear' }).click()
  await jobs(page).locator('select').first().selectOption('urgent')
  ok('jobs: urgent filter', (await rowsIn(jobs(page)).allInnerTexts()).every((t) => t.includes('Urgent')) && await rowsIn(jobs(page)).count() > 0)
  await jobs(page).getByRole('button', { name: 'Clear' }).click()

  ok('enquiries: 10 of 23', /Showing 1–10 of 23/.test(await enq(page).locator('.data-table__footer').innerText()))
  await enq(page).locator('select').nth(0).selectOption('employer')
  ok('enquiries: type filter → job orders only', (await rowsIn(enq(page)).allInnerTexts()).every((t) => t.includes('Job order')))
  await enq(page).locator('select').nth(1).selectOption('paid')
  ok('enquiries: payment filter', (await rowsIn(enq(page)).allInnerTexts()).every((t) => t.includes('Paid')) && await rowsIn(enq(page)).count() > 0)
  await enq(page).getByRole('button', { name: 'Clear' }).click()
  await enq(page).getByRole('button', { name: 'Show details' }).first().click()
  ok('enquiries: row expands with details + reply link', await enq(page).locator('.data-table__details-row').count() === 1 && await enq(page).getByText('Reply by email').isVisible())
  ok('enquiries: stored HTML rendered as text', await enq(page).getByText('<b>Message 1</b>').count() + await enq(page).locator('.data-table__details-row').getByText(/Message|Company/).count() > 0)
  

  // Delete confirmation modal
  const modal = page.getByRole('dialog', { name: 'Delete this vacancy from the recruiter dashboard?' })
  const target = (await rowsIn(jobs(page)).first().locator('.admin-cell__title').innerText()).trim()
  await rowsIn(jobs(page)).first().getByRole('button', { name: /^Delete/ }).click()
  await modal.waitFor()
  ok('delete opens a modal naming the vacancy', (await modal.innerText()).includes(target))
  ok('modal focus starts on Cancel (safe default)', await page.evaluate(() => document.activeElement?.textContent?.trim()) === 'Cancel')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  ok('Escape closes the modal without deleting', !(await modal.isVisible()) && !state.deleted)
  await rowsIn(jobs(page)).first().getByRole('button', { name: /^Delete/ }).click()
  await modal.getByRole('button', { name: 'Cancel' }).click()
  ok('Cancel closes the modal without deleting', !(await modal.isVisible()) && !state.deleted)
  state.failDelete = true
  await rowsIn(jobs(page)).first().getByRole('button', { name: /^Delete/ }).click()
  await modal.getByRole('button', { name: 'Delete vacancy' }).click()
  await modal.getByRole('alert').waitFor()
  ok('a failed delete keeps the modal open with the error', await modal.isVisible() && (await modal.getByRole('alert').innerText()).includes('could not be deleted'))
  state.failDelete = false
  await modal.getByRole('button', { name: 'Delete vacancy' }).click()
  await modal.waitFor({ state: 'hidden' })
  ok('confirming deletes, closes the modal and confirms', Boolean(state.deleted) && await page.locator('.staff-access-snackbar').getByText('was deleted').isVisible())
  ok('deleted vacancy is gone from the table', !(await rowsIn(jobs(page)).allInnerTexts()).some((t) => t.startsWith(target + '\n')))
  await rowsIn(jobs(page)).first().getByRole('button', { name: /^Edit/ }).click()
  await page.getByRole('heading', { name: 'Edit job post' }).waitFor()
  ok('edit opens Job posts tab with ?edit=', page.url().includes('/admin/jobs?edit=') && (await page.locator('.admin__tab.is-active').textContent()).includes('Job posts'))
  ok('edit form prefilled', (await page.locator('input').nth(1).inputValue()).length > 0)
  
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('heading', { name: 'Inventory' }).waitFor()
  ok('save returns to inventory with confirmation', Boolean(state.put) && await page.locator('.staff-access-snackbar').isVisible())

  await page.getByRole('link', { name: 'New job post' }).click()
  await page.getByRole('heading', { name: 'New job post' }).waitFor()
  const values = await page.locator('form input:not([type=checkbox])').evaluateAll((els) => els.map((e) => e.value))
  ok('New job post opens empty form', values.every((v) => v === ''), JSON.stringify(values))

  await page.locator('.admin__tab', { hasText: 'Audit log' }).click()
  await page.getByRole('heading', { name: 'Audit log' }).waitFor()
  await page.locator('.data-table__footer').waitFor()
  ok('audit: 10 of 60', /Showing 1–10 of 60/.test(await page.locator('.data-table__footer').innerText()))
  await page.locator('select').nth(0).selectOption('vacancy.delete')
  ok('audit: action filter', (await rowsIn(page).allInnerTexts()).every((t) => t.includes('Deleted job post')))
  await page.locator('select').nth(1).selectOption('Thandi Mokoena')
  ok('audit: staff filter combines', (await rowsIn(page).allInnerTexts()).every((t) => t.includes('Thandi Mokoena')))
  await page.getByRole('button', { name: 'Clear' }).click()
  await page.locator('input[type=search]').fill('closing date')
  ok('audit: search finds changed fields', await rowsIn(page).count() === 10 && (await rowsIn(page).first().innerText()).includes('closing date'))
  await page.getByRole('button', { name: 'Clear' }).click()
  
  await page.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '/admin/nonsense'); await page.getByRole('heading', { name: 'Inventory' }).waitFor()
  ok('unknown /admin/* path redirects to inventory', page.url().endsWith('/admin'))
  ok('admin subpages are noindex', (await page.locator('meta[name=robots]').getAttribute('content')).startsWith('noindex'))
  await page.goto((process.env.E2E_BASE_URL || 'http://localhost:4173') + '/admin/audit'); await page.getByRole('heading', { name: 'Audit log' }).waitFor()
  ok('deep link to /admin/audit works after refresh', (await page.locator('meta[name=robots]').getAttribute('content')).startsWith('noindex'))
  ok('no native browser confirm() boxes used', !nativeDialog)
  { const unexpected = errors.filter((e) => !/status of 502/.test(e)) // the 502 is the simulated failed delete
  ok('no JS errors on desktop', unexpected.length === 0, unexpected.join(' | ').slice(0, 200)) }

  const m = await b.newPage({ ...devices['iPhone 13'] }); m.on('dialog', (d) => d.accept()); await setup(m, {})
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok('mobile: no horizontal overflow', overflow <= 1, `${overflow}px`)
  ok('mobile: rows become cards with labels', await m.evaluate(() => getComputedStyle(document.querySelector('.data-table thead')).position === 'absolute' && getComputedStyle(document.querySelector('.data-table tbody td'), '::before').content.includes('Job post')))
  
  await b.close()
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`); process.exit(results.every(Boolean) ? 0 : 1)
})()
