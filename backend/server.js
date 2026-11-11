require('dotenv').config()
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const app = express()
const port = Number(process.env.PORT || 3001)
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const configuredOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim())
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? configuredOrigins
  : [...new Set([...configuredOrigins, 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'])]
const todayInSouthAfrica = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)

app.disable('x-powered-by')
if (process.env.TRUST_PROXY_HOPS) {
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS)
  if (!Number.isInteger(proxyHops) || proxyHops < 1) throw new Error('TRUST_PROXY_HOPS must be a positive integer.')
  app.set('trust proxy', proxyHops)
}
if (process.env.NODE_ENV === 'production' && (!process.env.FRONTEND_ORIGIN || configuredOrigins.some((origin) => !origin.startsWith('https://')))) {
  throw new Error('Production requires FRONTEND_ORIGIN to contain only HTTPS origins.')
}
if (process.env.NODE_ENV === 'production') {
  const validOrigin = (origin) => {
    try { const parsed = new URL(origin); return parsed.protocol === 'https:' && parsed.origin === origin }
    catch { return false }
  }
  if (configuredOrigins.some((origin) => !validOrigin(origin))) throw new Error('Each production FRONTEND_ORIGIN must be an exact HTTPS origin without a path.')
  if (!supabaseUrl || !anonKey || !serviceKey) throw new Error('Production requires Supabase URL, anon key, and service-role key configuration.')
  try {
    if (new URL(supabaseUrl).protocol !== 'https:') throw new Error()
  } catch { throw new Error('Production SUPABASE_URL must be a valid HTTPS URL.') }
}
app.use(helmet())
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '32kb' }))

const rateBuckets = new Map()
const rateWindowMs = 60_000
const rateLimits = { login: 5, publicWrite: 6, staff: 60, api: 120 }
const rateSweep = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key)
}, rateWindowMs)
rateSweep.unref()
app.use('/api', (req, res, next) => {
  const now = Date.now()
  const group = req.path === '/staff/login' ? 'login'
    : req.path.startsWith('/staff/') ? 'staff'
      : req.method !== 'GET' && req.path !== '/health' ? 'publicWrite' : 'api'
  const key = `${req.ip}:${group}`
  let bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + rateWindowMs }
  if (bucket.count >= rateLimits[group]) {
    res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
    return res.status(429).json({ error: 'Too many requests. Try again shortly.' })
  }
  bucket.count += 1
  if (!rateBuckets.has(key) && rateBuckets.size >= 20_000) {
    for (const [entry, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(entry)
      if (rateBuckets.size < 20_000) break
    }
    if (rateBuckets.size >= 20_000) rateBuckets.delete(rateBuckets.keys().next().value)
  }
  rateBuckets.set(key, bucket)
  next()
})

function requireConfig(res) {
  if (!supabaseUrl || !anonKey || !serviceKey) {
    res.status(503).json({ error: 'Supabase is not configured on the server.' })
    return false
  }
  return true
}

async function supabase(path, { key = serviceKey, token, method = 'GET', body, prefer } = {}) {
  const headers = { apikey: key }
  if (token) headers.Authorization = `Bearer ${token}`
  else if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const response = await fetch(`${supabaseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) })
  const text = await response.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!response.ok) throw Object.assign(new Error(data?.message || 'Supabase request failed.'), { status: response.status })
  return data
}

function toVacancy(row) {
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    region: row.region,
    industry: row.industry,
    category: row.category,
    employmentType: row.employment_type,
    isUrgent: row.is_urgent === true,
    closingDate: row.closing_date || null,
    salary: row.salary,
    posted: row.created_at,
    applicationUrl: row.application_url,
    summary: row.summary,
    responsibilities: Array.isArray(row.responsibilities) ? row.responsibilities : [],
    source: 'recruiter',
    clientName: row.client_name,
  }
}

function fromVacancy(body) {
  const required = ['clientName', 'title', 'location', 'region', 'category', 'employmentType', 'summary']
  if (!body || required.some((key) => typeof body[key] !== 'string' || !body[key].trim()) || !Array.isArray(body.responsibilities) || !body.responsibilities.length) {
    throw Object.assign(new Error('Complete all required vacancy fields.'), { status: 400 })
  }
  if (!['Permanent', 'Contract', 'Fixed-term', 'Temporary'].includes(body.employmentType)) {
    throw Object.assign(new Error('Choose a valid employment type.'), { status: 400 })
  }
  if (body.closingDate && (!/^\d{4}-\d{2}-\d{2}$/.test(body.closingDate) || Number.isNaN(Date.parse(`${body.closingDate}T00:00:00Z`)) || new Date(`${body.closingDate}T00:00:00Z`).toISOString().slice(0, 10) !== body.closingDate)) {
    throw Object.assign(new Error('Choose a valid closing date.'), { status: 400 })
  }
  if (body.closingDate && body.closingDate < todayInSouthAfrica()) {
    throw Object.assign(new Error('Choose a closing date that is today or later.'), { status: 400 })
  }
  let applicationUrl = null
  if (body.applicationUrl !== undefined && body.applicationUrl !== null && body.applicationUrl !== '') {
    if (typeof body.applicationUrl !== 'string' || body.applicationUrl.length > 500) {
      throw Object.assign(new Error('Enter a valid HTTPS application URL, up to 500 characters.'), { status: 400 })
    }
    try {
      const parsedUrl = new URL(body.applicationUrl.trim())
      if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) throw new Error()
      applicationUrl = parsedUrl.toString()
    } catch {
      throw Object.assign(new Error('Enter a valid HTTPS application URL.'), { status: 400 })
    }
  }
  const text = (value, max) => String(value || '').trim().slice(0, max)
  return {
    client_name: text(body.clientName, 160),
    title: text(body.title, 160),
    location: text(body.location, 160),
    region: text(body.region, 100),
    industry: text(body.industry, 100) || null,
    category: text(body.category, 100),
    employment_type: body.employmentType,
    is_urgent: body.isUrgent === true,
    closing_date: body.closingDate || null,
    salary: text(body.salary, 120) || null,
    application_url: applicationUrl,
    summary: text(body.summary, 3000),
    responsibilities: body.responsibilities.slice(0, 30).map((item) => text(item, 500)).filter(Boolean),
  }
}

async function requireStaff(req, res, next) {
  if (!requireConfig(res)) return
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' })
    const user = await supabase('/auth/v1/user', { key: anonKey, token })
    const profiles = await supabase(`/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=user_id`)
    if (!profiles.length) return res.status(403).json({ error: 'This account is not authorized for staff access.' })
    req.staffUser = user
    next()
  } catch {
    res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' })
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/api/vacancies', async (_req, res) => {
  if (!requireConfig(res)) return
  try {
    const rows = await supabase('/rest/v1/vacancies?status=eq.published&select=*&order=created_at.desc', { key: anonKey })
    const today = todayInSouthAfrica()
    res.json({ vacancies: rows.filter((row) => !row.closing_date || row.closing_date >= today).map((row) => {
      const vacancy = toVacancy(row)
      delete vacancy.clientName
      return vacancy
    }) })
  } catch { res.status(502).json({ error: 'Current vacancies could not be loaded.' }) }
})

app.post('/api/contact', async (req, res) => {
  if (!requireConfig(res)) return
  const { name, email, phone = '', enquiryType, subject, message, website = '' } = req.body || {}
  if (website) return res.json({ ok: true })
  if (![name, email, enquiryType, subject, message].every((value) => typeof value === 'string' && value.trim()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['Hiring and permanent staffing', 'Job opportunities', 'Other enquiry'].includes(enquiryType) || name.length > 120 || email.length > 254 || subject.length > 160 || message.length > 5000 || typeof phone !== 'string' || phone.length > 40) {
    return res.status(400).json({ error: 'Check the required fields and try again.' })
  }
  try {
    await supabase('/rest/v1/contact_inquiries', { method: 'POST', body: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), enquiry_type: enquiryType, subject: subject.trim(), message: message.trim() }, prefer: 'return=minimal' })
    res.status(201).json({ ok: true })
  } catch { res.status(502).json({ error: 'We could not save your enquiry. Please try again.' }) }
})

app.post('/api/employer-inquiries', async (req, res) => {
  if (!requireConfig(res)) return
  const details = req.body?.details
  if (!details || typeof details !== 'object' || Array.isArray(details) || Object.keys(details).length > 40 || details.authorizedContact !== true) return res.status(400).json({ error: 'Review the job order details and confirm you are authorized to share them.' })
  const fields = new Set(['legalName', 'tradingName', 'registrationNumber', 'vatNumber', 'companyAddress', 'contactName', 'email', 'phone', 'billingContact', 'billingAddress', 'jobTitle', 'jobLocation', 'numberOfHires', 'employmentType', 'workingHours', 'salary', 'closingDate', 'duties', 'requirements', 'qualifications', 'authorizedContact'])
  if (Object.entries(details).some(([key, value]) => !fields.has(key) || (key === 'authorizedContact' ? value !== true : typeof value !== 'string' || value.length > 5000))) return res.status(400).json({ error: 'Some job order details are invalid or too long.' })
  if (typeof details.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) || !/^[1-9]\d{0,3}$/.test(details.numberOfHires)) return res.status(400).json({ error: 'Enter a valid company email and number of hires.' })
  try {
    await supabase('/rest/v1/employer_inquiries', { method: 'POST', body: { details }, prefer: 'return=minimal' })
    res.status(201).json({ ok: true })
  } catch { res.status(502).json({ error: 'We could not save the job order. Please try again.' }) }
})

app.post('/api/staff/login', async (req, res) => {
  if (!requireConfig(res)) return
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || password.length > 256) return res.status(400).json({ error: 'Enter your staff email and password.' })
  try {
    const session = await supabase('/auth/v1/token?grant_type=password', { key: anonKey, method: 'POST', body: { email: email.trim().toLowerCase(), password } })
    const profiles = await supabase(`/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(session.user.id)}&active=eq.true&select=user_id`)
    if (!profiles.length) return res.status(403).json({ error: 'This account is not authorized for staff access.' })
    res.json({ accessToken: session.access_token, email: session.user.email })
  } catch { res.status(401).json({ error: 'Email or password is incorrect.' }) }
})

app.get('/api/staff/me', requireStaff, (req, res) => res.json({ email: req.staffUser.email }))
app.get('/api/staff/vacancies', requireStaff, async (_req, res) => {
  try {
    const rows = await supabase('/rest/v1/vacancies?select=*&order=created_at.desc')
    res.json({ vacancies: rows.map(toVacancy) })
  } catch { res.status(502).json({ error: 'Vacancies could not be loaded.' }) }
})
app.get('/api/staff/inquiries', requireStaff, async (_req, res) => {
  try {
    const [contacts, employers] = await Promise.all([
      supabase('/rest/v1/contact_inquiries?select=id,email,subject,message,created_at&order=created_at.desc&limit=100'),
      supabase('/rest/v1/employer_inquiries?select=id,details,created_at&order=created_at.desc&limit=100'),
    ])
    const inquiries = [...contacts.map((item) => ({ ...item, kind: 'contact' })), ...employers.map((item) => ({ ...item, kind: 'employer' }))]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    res.json({ inquiries })
  } catch { res.status(502).json({ error: 'Enquiries could not be loaded.' }) }
})

app.post('/api/staff/vacancies', requireStaff, async (req, res) => {
  try {
    const [row] = await supabase('/rest/v1/vacancies', { method: 'POST', body: fromVacancy(req.body), prefer: 'return=representation' })
    res.status(201).json({ vacancy: toVacancy(row) })
  } catch (error) { res.status(error.status === 400 ? 400 : 502).json({ error: error.status === 400 ? error.message : 'Vacancy could not be saved.' }) }
})
app.put('/api/staff/vacancies/:id', requireStaff, async (req, res) => {
  try {
    const rows = await supabase(`/rest/v1/vacancies?id=eq.${encodeURIComponent(req.params.id)}`, { method: 'PATCH', body: fromVacancy(req.body), prefer: 'return=representation' })
    if (!rows.length) return res.status(404).json({ error: 'Vacancy not found.' })
    res.json({ vacancy: toVacancy(rows[0]) })
  } catch (error) { res.status(error.status === 400 ? 400 : 502).json({ error: error.status === 400 ? error.message : 'Vacancy could not be updated.' }) }
})
app.delete('/api/staff/vacancies/:id', requireStaff, async (req, res) => {
  try {
    await supabase(`/rest/v1/vacancies?id=eq.${encodeURIComponent(req.params.id)}`, { method: 'DELETE', prefer: 'return=minimal' })
    res.json({ ok: true })
  } catch { res.status(502).json({ error: 'Vacancy could not be deleted.' }) }
})

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError) return res.status(400).json({ error: 'Request body must be valid JSON.' })
  res.status(500).json({ error: 'Unexpected server error.' })
})
app.listen(port, () => console.log(`IMFORCE API listening on ${port}`))
