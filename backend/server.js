require('dotenv').config()
const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { createSecurityMonitor } = require('./security')
const { createMailer, escapeHtml } = require('./mailer')

const app = express()
const port = Number(process.env.PORT || 3001)
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY
const paystackWebhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET
const configuredOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim())
const paystackCallbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${configuredOrigins[0].replace(/\/$/, '')}/employers`
// Public website address used in links sent to employers by email.
const publicSiteUrl = (process.env.PUBLIC_SITE_URL || configuredOrigins[0]).replace(/\/$/, '')
const mailer = createMailer(process.env)
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? configuredOrigins
  : [...new Set([...configuredOrigins, 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'])]
const securityAlertWebhookUrl = process.env.SECURITY_ALERT_WEBHOOK_URL || ''
// Staff two-factor sign-in (TOTP via Supabase Auth MFA). On unless explicitly disabled.
const staffMfaRequired = process.env.STAFF_MFA_REQUIRED !== 'false'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
  if (!paystackSecretKey) throw new Error('Production requires PAYSTACK_SECRET_KEY for employer checkout.')
  try {
    const callback = new URL(paystackCallbackUrl)
    if (callback.protocol !== 'https:' || !allowedOrigins.includes(callback.origin) || callback.pathname !== '/employers') throw new Error()
  } catch { throw new Error('PAYSTACK_CALLBACK_URL must be an HTTPS /employers URL on an allowed FRONTEND_ORIGIN.') }
  try {
    if (new URL(supabaseUrl).protocol !== 'https:') throw new Error()
  } catch { throw new Error('Production SUPABASE_URL must be a valid HTTPS URL.') }
  if (!staffMfaRequired) console.warn('WARNING: STAFF_MFA_REQUIRED=false. Staff can sign in with a password only.')
  try { if (new URL(publicSiteUrl).protocol !== 'https:') throw new Error() }
  catch { throw new Error('PUBLIC_SITE_URL (or the first FRONTEND_ORIGIN) must be an HTTPS URL for links in emails.') }
  if (!mailer.configured) console.warn('WARNING: SMTP_HOST is not set. Employer emails are not sent; staff will be given links to send themselves.')
  if (securityAlertWebhookUrl) {
    try { if (new URL(securityAlertWebhookUrl).protocol !== 'https:') throw new Error() }
    catch { throw new Error('SECURITY_ALERT_WEBHOOK_URL must be an HTTPS URL.') }
  }
}

// Linear-time email check. A backtracking regex on unbounded input let one
// 30 KB request block the event loop for over a second (ReDoS).
function isEmail(value) {
  if (typeof value !== 'string') return false
  const email = value.trim()
  if (email.length < 6 || email.length > 254 || /\s/.test(email)) return false
  const at = email.indexOf('@')
  if (at < 1 || at !== email.lastIndexOf('@') || at > 64) return false
  const domain = email.slice(at + 1)
  const dot = domain.lastIndexOf('.')
  return dot > 0 && dot < domain.length - 2 && !domain.includes('..')
}

const security = createSecurityMonitor({
  alertWebhookUrl: securityAlertWebhookUrl,
  allowlist: (process.env.SECURITY_ALLOWLIST_IPS || '').split(',').map((value) => value.trim()),
  blockPrivateAddresses: process.env.SECURITY_BLOCK_PRIVATE_IPS === 'true',
  persistEvent: async (event) => {
    if (!supabaseUrl || !serviceKey) return
    await supabase('/rest/v1/security_events', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        occurred_at: event.at, event_type: event.type, severity: event.severity, action: event.action,
        ip_address: event.ip, method: event.method, path: event.path, user_agent: event.userAgent,
        detail: event.detail, threat_score: event.threatScore,
      },
    })
  },
})

app.use(helmet())
// One JSON line per API request (no query strings or bodies, so no personal data).
app.use((req, res, next) => {
  if (req.path === '/api/health') return next()
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return
    console.log(JSON.stringify({
      level: 'access', at: new Date().toISOString(), method: req.method, path: req.path.slice(0, 200),
      status: res.statusCode, ms: Number((process.hrtime.bigint() - started) / 1_000_000n), ip: req.ip,
    }))
  })
  next()
})
app.use(cors({ origin: allowedOrigins, credentials: true }))
app.use(security.guard)
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Send the request as JSON.' })
  }
  next()
})
app.use(express.json({
  limit: '32kb',
  verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer) },
}))
app.use(security.tripwire)
app.use('/api/staff', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })

const rateBuckets = new Map()
const rateWindowMs = 60_000
const rateLimits = { login: 5, publicWrite: 6, staff: 60, webhook: 120, api: 120 }
const rateSweep = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key)
}, rateWindowMs)
rateSweep.unref()
app.use('/api', (req, res, next) => {
  const now = Date.now()
  const group = req.path === '/staff/login' || req.path === '/staff/mfa/verify' ? 'login'
    : req.path === '/payments/paystack/webhook' ? 'webhook'
    : req.path.startsWith('/staff/') ? 'staff'
      : req.method !== 'GET' && req.path !== '/health' ? 'publicWrite' : 'api'
  const key = `${req.ip}:${group}`
  let bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + rateWindowMs }
  if (bucket.count >= rateLimits[group]) {
    if (bucket.count === rateLimits[group]) security.record(req, `rate-limit:${group}`, group === 'login' ? 'medium' : 'low', 'Request limit exceeded')
    bucket.count += 1
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

// --- Remembered (trusted) devices for staff two-factor sign-in -------------
// A random token lives in an HttpOnly cookie scoped to /api/staff; only its
// SHA-256 hash is stored (migration 007). It skips the authenticator step on
// that browser for 30 days, for that staff account only, until revoked.
const trustedDeviceCookie = 'imf_trusted_device'
const trustedDeviceDays = 30
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return ''
}

function setTrustedDeviceCookie(res, token, maxAgeSeconds) {
  const attributes = [`${trustedDeviceCookie}=${token}`, 'Path=/api/staff', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`]
  if (process.env.NODE_ENV === 'production') attributes.push('Secure')
  res.append('Set-Cookie', attributes.join('; '))
}

// Returns the active trusted-device row for this browser and user, or null.
async function findTrustedDevice(req, userId) {
  const token = readCookie(req, trustedDeviceCookie)
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !userId) return null
  const query = new URLSearchParams({
    select: 'id', token_hash: `eq.${sha256(token)}`, user_id: `eq.${userId}`,
    revoked_at: 'is.null', expires_at: `gt.${new Date().toISOString()}`, limit: '1',
  })
  try { return (await supabase(`/rest/v1/staff_trusted_devices?${query}`))[0] ?? null } catch { return null }
}

function describeDevice(req) {
  const agent = String(req.get('user-agent') || '')
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser'
  const system = /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'unknown system'
  return `${browser} on ${system}`
}

// Supabase's MFA API returns the enrolment QR code as raw SVG markup (its JS
// client adds the data: prefix itself). Accept both forms and return a safe,
// URL-encoded data URL for an <img> (SVG in <img> cannot run scripts).
function qrCodeDataUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 200_000) return null
  const value = raw.trim()
  if (value.startsWith('data:image/svg+xml')) return value
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(value)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`
  return null
}
// otpauth:// link so a staff member setting up on their phone can tap instead of scan.
const authenticatorUri = (uri) => (typeof uri === 'string' && uri.length < 2000 && uri.startsWith('otpauth://totp/') ? uri : null)

// Reads claims from a token Supabase has already validated (via /auth/v1/user).
// Never use this on its own to trust a token: it does not check the signature.
function tokenClaims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) || {} }
  catch { return {} }
}

async function requireStaff(req, res, next) {
  if (!requireConfig(res)) return
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'Sign in to continue.' })
    if (token.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
      security.record(req, 'malformed-staff-token', 'medium', 'Staff route called with a malformed token')
      return res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' })
    }
    const user = await supabase('/auth/v1/user', { key: anonKey, token })
    const profiles = await supabase(`/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=user_id,username,display_name`)
    if (!profiles.length) {
      security.record(req, 'non-staff-token', 'high', 'Valid account without an active staff profile called a staff route')
      return res.status(403).json({ error: 'This account is not authorized for staff access.' })
    }
    req.trustedDevice = staffMfaRequired ? await findTrustedDevice(req, user.id) : null
    if (staffMfaRequired && tokenClaims(token).aal !== 'aal2' && !req.trustedDevice) {
      security.record(req, 'staff-token-without-mfa', 'medium', 'Staff route called with a session that has not completed two-factor sign-in')
      return res.status(401).json({ error: 'Two-factor sign-in is required. Sign in again.' })
    }
    req.staffUser = user
    req.staffProfile = profiles[0]
    req.staffToken = token
    next()
  } catch {
    security.record(req, 'invalid-staff-token', 'low', 'Staff route called with an invalid or expired token')
    res.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' })
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/api/vacancies', async (_req, res) => {
  if (!requireConfig(res)) return
  try {
    const rows = await supabase('/rest/v1/vacancies?status=eq.published&select=id,title,location,region,industry,category,employment_type,is_urgent,closing_date,salary,application_url,summary,responsibilities,created_at&order=created_at.desc', { key: anonKey })
    const today = todayInSouthAfrica()
    res.json({ vacancies: rows.filter((row) => !row.closing_date || row.closing_date >= today).map((row) => {
      const vacancy = toVacancy(row)
      delete vacancy.clientName
      return vacancy
    }) })
  } catch { res.status(502).json({ error: 'Current vacancies could not be loaded.' }) }
})

const enquiryReference = (id) => `ENQ-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`

app.post('/api/contact', async (req, res) => {
  if (!requireConfig(res)) return
  const { name, email, phone = '', enquiryType, subject, message, website = '', extraNotesHp = '' } = req.body || {}
  if (website || extraNotesHp) {
    // Hidden honeypot field: humans never see it, form-filling bots do.
    security.record(req, 'bot-honeypot-field', 'medium', 'Hidden contact form field was filled')
    return res.json({ ok: true })
  }
  if (![name, email, enquiryType, subject, message].every((value) => typeof value === 'string' && value.trim()) || typeof phone !== 'string' || name.length > 120 || email.length > 254 || subject.length > 160 || message.length > 5000 || phone.length > 40 || !isEmail(email) || !['Hiring and permanent staffing', 'Job opportunities', 'Other enquiry'].includes(enquiryType)) {
    return res.status(400).json({ error: 'Check the required fields and try again.' })
  }
  try {
    const [saved] = await supabase('/rest/v1/contact_inquiries?select=id', { method: 'POST', body: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), enquiry_type: enquiryType, subject: subject.trim(), message: message.trim() }, prefer: 'return=representation' })
    // Short reference the visitor can quote; staff can search for it in the inventory.
    res.status(201).json({ ok: true, reference: saved?.id ? enquiryReference(saved.id) : null })
  } catch { res.status(502).json({ error: 'We could not save your enquiry. Please try again.' }) }
})

const activationFeeMinor = 49_900
const activationFeeCurrency = 'ZAR'
const employerFieldLabels = {
  legalName: 'Legal company name', tradingName: 'Trading name', registrationNumber: 'Company registration number',
  vatNumber: 'VAT number', companyAddress: 'Company street address', contactName: 'Contact person',
  email: 'Contact email', phone: 'Contact phone', billingContact: 'Billing contact', billingAddress: 'Billing address',
  jobTitle: 'Job title', jobLocation: 'Job location', numberOfHires: 'Number of people to hire',
  employmentType: 'Employment type', workingHours: 'Working hours', salary: 'Salary or salary range',
  closingDate: 'Closing date', duties: 'Main duties', requirements: 'Skills and requirements',
  qualifications: 'Qualifications and experience', authorizedContact: 'Authority confirmation',
}

function validateEmployerOrder(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return { error: 'The job order details were not received correctly. Please return to the form and submit again.' }
  }
  const errors = []
  const requiredFields = [
    'legalName', 'registrationNumber', 'companyAddress', 'contactName', 'email', 'phone', 'billingContact',
    'billingAddress', 'jobTitle', 'jobLocation', 'numberOfHires', 'employmentType', 'workingHours', 'salary',
    'closingDate', 'duties', 'requirements', 'qualifications',
  ]
  for (const field of requiredFields) {
    if (typeof details[field] !== 'string' || !details[field].trim()) {
      errors.push({ field, message: `${employerFieldLabels[field]} is required. Enter this information to continue.` })
    }
  }
  if (details.authorizedContact !== true) {
    errors.push({ field: 'authorizedContact', message: 'Confirm that you are authorized to share these job details with IMFORCE.' })
  }
  if (Object.keys(details).length > 40) errors.push({ field: 'details', message: 'The submission contains too many fields. Remove extra details and try again.' })
  for (const [field, value] of Object.entries(details)) {
    if (!(field in employerFieldLabels)) {
      errors.push({ field: 'details', message: 'The submission contains an unsupported field. Return to the form and submit the visible fields only.' })
    } else if (field !== 'authorizedContact' && (typeof value !== 'string' || value.length > 5000)) {
      errors.push({ field, message: `${employerFieldLabels[field]} must be text no longer than 5,000 characters.` })
    }
  }
  if (typeof details.email === 'string' && details.email.trim() && !isEmail(details.email)) {
    errors.push({ field: 'email', message: 'Enter a valid email address, for example name@company.co.za.' })
  }
  if (typeof details.phone === 'string' && details.phone.trim() && (details.phone.replace(/\D/g, '').length < 7 || details.phone.replace(/\D/g, '').length > 15)) {
    errors.push({ field: 'phone', message: 'Enter a phone number with 7 to 15 digits, including the country code if applicable.' })
  }
  if (typeof details.numberOfHires === 'string' && details.numberOfHires.trim() && !/^[1-9]\d{0,3}$/.test(details.numberOfHires.trim())) {
    errors.push({ field: 'numberOfHires', message: 'Enter a whole number from 1 to 9,999.' })
  }
  if (typeof details.employmentType === 'string' && details.employmentType && !['Permanent', 'Fixed-term', 'Contract', 'Temporary'].includes(details.employmentType)) {
    errors.push({ field: 'employmentType', message: 'Choose Permanent, Fixed-term, Contract, or Temporary.' })
  }
  if (typeof details.closingDate === 'string' && details.closingDate && (!/^\d{4}-\d{2}-\d{2}$/.test(details.closingDate) || Number.isNaN(Date.parse(`${details.closingDate}T00:00:00Z`)) || new Date(`${details.closingDate}T00:00:00Z`).toISOString().slice(0, 10) !== details.closingDate || details.closingDate < todayInSouthAfrica())) {
    errors.push({ field: 'closingDate', message: 'Choose a valid closing date today or later.' })
  }
  if (typeof details.salary === 'string' && details.salary.trim() && details.salary.trim().length < 3) {
    errors.push({ field: 'salary', message: 'Enter a salary or range, or choose “Market Related Salary” from the salary option.' })
  }
  for (const [field, minimum, guidance] of [
    ['duties', 40, 'Add the main day-to-day responsibilities and what the person will do.'],
    ['requirements', 25, 'Describe the skills, capabilities, or experience the candidate needs.'],
    ['qualifications', 20, 'Specify the required qualifications or relevant experience.'],
  ]) {
    if (typeof details[field] === 'string' && details[field].trim().length > 0 && details[field].trim().length < minimum) {
      errors.push({ field, message: `${employerFieldLabels[field]} needs more detail (${minimum} characters minimum). ${guidance}` })
    }
  }
  const uniqueErrors = [...new Map(errors.map((issue) => [`${issue.field}:${issue.message}`, issue])).values()]
  return uniqueErrors.length
    ? { errors: uniqueErrors, error: `Please correct these job order details: ${uniqueErrors.map((issue) => issue.message).join(' ')}` }
    : null
}

function paystackHeaders() {
  return { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' }
}

async function verifyPaystackTransaction(reference) {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: paystackHeaders(),
    signal: AbortSignal.timeout(15_000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.status !== true || !result.data) {
    throw Object.assign(new Error('Paystack could not verify this payment right now.'), { status: 502 })
  }
  return result.data
}

async function findEmployerOrderByPaymentReference(reference) {
  const select = 'id,details,review_status'
  const [current] = await supabase(`/rest/v1/employer_inquiries?${new URLSearchParams({ select, 'details->>paymentReference': `eq.${reference}`, limit: '1' })}`)
  if (current) return current
  // An older checkout of the same order (e.g. an old Paystack tab paid later).
  const [earlier] = await supabase(`/rest/v1/employer_inquiries?${new URLSearchParams({ select, 'details->paymentReferences': `cs.${JSON.stringify([reference])}`, limit: '1' })}`)
  return earlier ?? null
}

async function confirmPaystackPayment(reference) {
  const record = await findEmployerOrderByPaymentReference(reference)
  if (!record) return { found: false, paid: false }
  const details = record.details
  const orderRef = orderReference(record.id)
  if (details.paymentStatus === 'paid') return { found: true, paid: true, orderRef }

  const transaction = await verifyPaystackTransaction(reference)
  const isPaid = transaction.status === 'success'
    && transaction.reference === reference
    && transaction.amount === activationFeeMinor
    && transaction.currency === activationFeeCurrency
    && transaction.customer?.email?.toLowerCase() === details.email?.toLowerCase()
  if (!isPaid) return { found: true, paid: false, orderRef }

  const paymentDetails = {
    ...details,
    paymentStatus: 'paid',
    paymentReference: reference,
    paymentAmountMinor: activationFeeMinor,
    paymentCurrency: activationFeeCurrency,
    paymentPaidAt: transaction.paid_at ?? new Date().toISOString(),
    paymentChannel: typeof transaction.channel === 'string' ? transaction.channel : null,
    paystackTransactionId: String(transaction.id),
  }
  // Only one caller (return page or webhook) records the payment and sends the email.
  const claimed = await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(record.id)}&details->>paymentStatus=neq.paid`, {
    method: 'PATCH', body: { details: paymentDetails }, prefer: 'return=representation',
  })
  if (claimed?.length) {
    await revokePaymentLinks(record.id)
    await sendEmployerEmail({ ...record, details: paymentDetails }, `We received your job order: ${String(details.jobTitle ?? 'job advert')} (${orderRef})`, {
      intro: [
        `Thank you. We received your ZAR 499 activation fee for the job order "${String(details.jobTitle ?? '')}" (reference ${orderRef}).`,
        'What happens next: an IMFORCE team member will review your advert within 1 business day. We will email you as soon as it is live, or if anything needs to change.',
      ],
      after: ['Paystack sends your proof of payment separately.'],
    })
  }
  return { found: true, paid: true, orderRef }
}

// Starts a Paystack checkout for an existing job order with a fresh reference,
// remembering earlier references so a late payment is still matched.
async function startPaystackCheckout(order) {
  const reference = `IMF-${crypto.randomUUID()}`
  const earlier = Array.isArray(order.details?.paymentReferences) ? order.details.paymentReferences
    : order.details?.paymentReference ? [order.details.paymentReference] : []
  const pendingDetails = {
    ...order.details,
    paymentStatus: 'initializing',
    paymentReference: reference,
    paymentReferences: [...earlier, reference].slice(-20),
    paymentAmountMinor: activationFeeMinor,
    paymentCurrency: activationFeeCurrency,
  }
  // Never overwrite a payment that was confirmed meanwhile (e.g. by the webhook).
  const patch = (status) => supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(order.id)}&details->>paymentStatus=neq.paid`, {
    method: 'PATCH', body: { details: { ...pendingDetails, paymentStatus: status } }, prefer: 'return=representation',
  })
  const started = await patch('initializing')
  if (!started?.length) throw Object.assign(new Error('Already paid'), { alreadyPaid: true })
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: paystackHeaders(),
      body: JSON.stringify({ email: pendingDetails.email, amount: String(activationFeeMinor), currency: activationFeeCurrency, reference, callback_url: paystackCallbackUrl }),
      signal: AbortSignal.timeout(15_000),
    })
    const result = await response.json().catch(() => null)
    const authorizationUrl = result?.data?.authorization_url
    let isPaystackCheckout = false
    try {
      const parsed = new URL(authorizationUrl)
      isPaystackCheckout = parsed.protocol === 'https:' && parsed.hostname === 'checkout.paystack.com'
    } catch { isPaystackCheckout = false }
    if (!response.ok || result?.status !== true || !isPaystackCheckout || result.data.reference !== reference) throw new Error('Invalid checkout URL')
    await patch('pending')
    return { authorizationUrl, reference }
  } catch (error) {
    await patch('initialization_failed').catch(() => {})
    throw error
  }
}

// Private payment links (migration 010): only the token hash is stored.
const paymentLinkDays = 7
async function createPaymentLink(orderId, purpose, staff = null) {
  const token = crypto.randomBytes(32).toString('base64url')
  const [link] = await supabase('/rest/v1/job_order_payment_links', {
    method: 'POST', prefer: 'return=representation',
    body: {
      order_id: orderId, token_hash: sha256(token), purpose,
      created_by: staff?.id ?? null, created_by_name: staff?.name ?? null,
      expires_at: new Date(Date.now() + paymentLinkDays * 86_400_000).toISOString(),
    },
  })
  return purpose === 'staff' ? { token, link } : token
}
async function findPaymentLink(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const query = new URLSearchParams({ select: 'id,order_id,purpose,expires_at', token_hash: `eq.${sha256(token)}`, revoked_at: 'is.null', expires_at: `gt.${new Date().toISOString()}`, limit: '1' })
  const [link] = await supabase(`/rest/v1/job_order_payment_links?${query}`)
  if (!link) return null
  const [order] = await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(link.order_id)}&select=id,details,review_status`)
  return order ? { link, order } : null
}
async function revokePaymentLinks(orderId, purpose = null) {
  await supabase(`/rest/v1/job_order_payment_links?order_id=eq.${encodeURIComponent(orderId)}&revoked_at=is.null${purpose ? `&purpose=eq.${purpose}` : ''}`, {
    method: 'PATCH', body: { revoked_at: new Date().toISOString() }, prefer: 'return=minimal',
  }).catch(() => { /* table may not exist before migration 010 */ })
}

app.post('/api/payments/paystack/initialize', async (req, res) => {
  if (!requireConfig(res)) return
  if (!paystackSecretKey) return res.status(503).json({ error: 'Secure checkout is not configured yet. Please contact IMFORCE.' })
  const details = req.body?.details
  if (details && typeof details === 'object') {
    for (const trapField of ['extraNotesHp', 'website']) {
      if (typeof details[trapField] === 'string' && details[trapField]) {
        security.record(req, 'bot-honeypot-field', 'medium', 'Hidden job order form field was filled')
        return res.status(400).json({ error: 'The job order could not be accepted. Please contact IMFORCE.' })
      }
      if (details[trapField] === '') delete details[trapField]
    }
  }
  const validation = validateEmployerOrder(details)
  if (validation) return res.status(400).json(validation)

  const normalizedDetails = { ...details, email: details.email.trim().toLowerCase() }
  let order
  try {
    ;[order] = await supabase('/rest/v1/employer_inquiries', {
      method: 'POST', prefer: 'return=representation',
      body: { details: { ...normalizedDetails, paymentStatus: 'initializing', paymentAmountMinor: activationFeeMinor, paymentCurrency: activationFeeCurrency } },
    })
    if (!order?.id) throw new Error('The job order record was not returned.')
  } catch {
    return res.status(502).json({ error: 'We could not save the job order securely. Please try again.' })
  }
  // Lets this browser tab retry payment for the SAME job order (no duplicates).
  const resumeToken = await createPaymentLink(order.id, 'checkout').catch(() => null)
  try {
    const checkout = await startPaystackCheckout(order)
    return res.status(201).json({ ...checkout, resumeToken })
  } catch {
    return res.status(502).json({ error: 'Paystack checkout could not be started. Your job order was saved; please try checkout again.', resumeToken })
  }
})

// Pay for an existing, unpaid job order: a retry from the same tab ('checkout'
// link, may also update the details) or a staff-sent payment link ('staff').
const invalidPaymentLink = 'This payment link is invalid or has expired. Contact IMFORCE and we will send you a new one.'
app.post('/api/payments/paystack/resume', async (req, res) => {
  if (!requireConfig(res)) return
  if (!paystackSecretKey) return res.status(503).json({ error: 'Secure checkout is not configured yet. Please contact IMFORCE.' })
  let found
  try { found = await findPaymentLink(req.body?.token) } catch { return res.status(502).json({ error: 'Your job order could not be loaded. Please try again.' }) }
  if (!found) {
    security.record(req, 'invalid-payment-link', 'low', 'Payment link that is invalid or expired')
    return res.status(404).json({ error: invalidPaymentLink })
  }
  let { order } = found
  if (order.details?.paymentStatus === 'paid') return res.status(409).json({ error: 'This job order is already paid. There is nothing more to pay.', alreadyPaid: true })
  if (order.review_status === 'rejected') return res.status(409).json({ error: 'This job order was closed by IMFORCE. Contact us before paying.' })
  const submitted = req.body?.details
  if (submitted !== undefined) {
    if (found.link.purpose !== 'checkout') return res.status(400).json({ error: 'This link can only be used to pay.' })
    if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return res.status(400).json({ error: 'The job order details were not received correctly.' })
    if (typeof submitted.extraNotesHp === 'string' && submitted.extraNotesHp) {
      security.record(req, 'bot-honeypot-field', 'medium', 'Hidden job order form field was filled')
      return res.status(400).json({ error: 'The job order could not be accepted. Please contact IMFORCE.' })
    }
    const { extraNotesHp, website, ...fields } = submitted
    void extraNotesHp; void website
    const validation = validateEmployerOrder(fields)
    if (validation) return res.status(400).json(validation)
    order = { ...order, details: { ...order.details, ...fields, email: fields.email.trim().toLowerCase() } }
  }
  try {
    res.json(await startPaystackCheckout(order))
  } catch (error) {
    if (error.alreadyPaid) return res.status(409).json({ error: 'This job order is already paid. There is nothing more to pay.', alreadyPaid: true })
    res.status(502).json({ error: 'Paystack checkout could not be started. Please try again in a moment.' })
  }
})

// Staff-sent payment link page: what is being paid for.
app.post('/api/payments/link/open', async (req, res) => {
  if (!requireConfig(res)) return
  let found
  try { found = await findPaymentLink(req.body?.token) } catch { return res.status(502).json({ error: 'Your job order could not be loaded. Please try again.' }) }
  if (!found) {
    security.record(req, 'invalid-payment-link', 'low', 'Payment link that is invalid or expired')
    return res.status(404).json({ error: invalidPaymentLink })
  }
  const details = found.order.details ?? {}
  res.set('Cache-Control', 'no-store')
  res.json({
    reference: orderReference(found.order.id), jobTitle: details.jobTitle ?? '', company: details.legalName ?? '',
    amount: 'ZAR 499', paid: details.paymentStatus === 'paid', closed: found.order.review_status === 'rejected', expiresAt: found.link.expires_at,
  })
})

app.post('/api/payments/paystack/verify', async (req, res) => {
  if (!requireConfig(res)) return
  if (!paystackSecretKey) return res.status(503).json({ error: 'Secure checkout is not configured yet. Please contact IMFORCE.' })
  const reference = req.body?.reference
  if (typeof reference !== 'string' || !/^IMF-[0-9a-f-]{36}$/i.test(reference)) {
    return res.status(400).json({ error: 'The Paystack payment reference is missing or invalid.' })
  }
  try {
    const result = await confirmPaystackPayment(reference)
    if (!result.found) {
      security.record(req, 'unknown-payment-reference', 'low', 'Payment verification for an unknown reference')
      return res.status(404).json({ error: 'No job order was found for this payment reference. Contact IMFORCE before trying to pay again.' })
    }
    if (!result.paid) return res.status(402).json({ error: 'Paystack has not confirmed the ZAR 499 payment. If your bank shows a debit, contact IMFORCE before trying again.' })
    return res.json({ paid: true, reference: result.orderRef, message: `Payment received. Your job order ${result.orderRef} is with our team, and we will review your advert within 1 business day.` })
  } catch {
    return res.status(502).json({ error: 'Payment verification is temporarily unavailable. Do not pay again yet; refresh this page or contact IMFORCE.' })
  }
})

function safeHexEqual(expected, received) {
  if (typeof received !== 'string' || !/^[\da-f]{128}$/i.test(received)) return false
  const expectedBuffer = Buffer.from(expected, 'hex')
  const receivedBuffer = Buffer.from(received, 'hex')
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}

function isValidPaystackWebhook(req) {
  const rawBody = req.rawBody
  if (!Buffer.isBuffer(rawBody)) return false
  const modernHeader = req.get('paystack-signature')
  if (modernHeader && paystackWebhookSecret) {
    const entries = modernHeader.split(',').map((part) => part.trim())
    const timestamp = entries.find((part) => part.startsWith('t='))?.slice(2)
    if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
    const signedPayload = crypto.createHmac('sha512', paystackWebhookSecret).update(`${timestamp}.`).update(rawBody).digest('hex')
    return entries.filter((part) => part.startsWith('v1=')).some((part) => safeHexEqual(signedPayload, part.slice(3).split(':').at(-1)))
  }
  const legacyHeader = req.get('x-paystack-signature')
  if (!legacyHeader || !paystackSecretKey) return false
  const expected = crypto.createHmac('sha512', paystackSecretKey).update(rawBody).digest('hex')
  return safeHexEqual(expected, legacyHeader)
}

app.post('/api/payments/paystack/webhook', async (req, res) => {
  if (!isValidPaystackWebhook(req)) {
    security.record(req, 'forged-payment-webhook', 'high', 'Payment webhook with a missing or invalid signature')
    return res.sendStatus(401)
  }
  if (req.body?.event !== 'charge.success') return res.sendStatus(200)
  const reference = req.body?.data?.reference
  if (typeof reference !== 'string' || !/^IMF-[0-9a-f-]{36}$/i.test(reference)) return res.sendStatus(200)
  try {
    await confirmPaystackPayment(reference)
    return res.sendStatus(200)
  } catch {
    return res.status(503).json({ error: 'Payment notification could not be processed yet.' })
  }
})

// Per-account lockout complements the per-IP limiter, so password guessing
// spread across many IP addresses (credential stuffing) is still stopped.
const loginFailures = new Map()
const loginFailureLimit = 5
const loginLockMs = 15 * 60 * 1000
const loginFailureMessage = 'Username or password is incorrect, or the account is temporarily locked. Try again later or contact your IMFORCE administrator.'
const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,31}$/
// Failed sign-ins take at least this long, so response time does not reveal
// whether a username exists (a known username needs extra lookups).
const failedLoginMinimumMs = 600
const padFailedLogin = async (startedAt) => {
  const wait = failedLoginMinimumMs - (Date.now() - startedAt)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait + crypto.randomInt(0, 120)))
}
const loadStaffProfile = async (userId) => (await supabase(`/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(userId)}&active=eq.true&select=user_id,username,display_name`))[0] ?? null

function accountLocked(email) {
  const entry = loginFailures.get(email)
  if (!entry) return false
  if (entry.resetAt <= Date.now()) { loginFailures.delete(email); return false }
  return entry.count >= loginFailureLimit
}

function recordLoginFailure(req, email) {
  const now = Date.now()
  let entry = loginFailures.get(email)
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + loginLockMs }
  entry.count += 1
  if (loginFailures.size >= 20_000 && !loginFailures.has(email)) loginFailures.delete(loginFailures.keys().next().value)
  loginFailures.set(email, entry)
  security.record(req, 'staff-login-failed', 'low', `Failed staff sign-in attempt ${entry.count} for an account`)
  if (entry.count === loginFailureLimit) security.record(req, 'staff-account-locked', 'high', 'Staff account locked after repeated failed sign-ins')
}

app.post('/api/staff/login', async (req, res) => {
  if (!requireConfig(res)) return
  const startedAt = Date.now()
  const { username, password } = req.body || {}
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || username.length > 64 || password.length > 256) {
    return res.status(400).json({ error: 'Enter your username and password.' })
  }
  const normalizedUsername = username.trim().toLowerCase()
  const fail = async (lockKey) => {
    if (lockKey) recordLoginFailure(req, lockKey)
    await padFailedLogin(startedAt)
    return res.status(401).json({ error: loginFailureMessage })
  }
  if (!usernamePattern.test(normalizedUsername)) return fail(`username:${normalizedUsername.slice(0, 64)}`)

  let profile
  let email
  try {
    ;[profile] = await supabase(`/rest/v1/staff_profiles?username=eq.${encodeURIComponent(normalizedUsername)}&active=eq.true&select=user_id,username,display_name`)
    if (profile) email = (await supabase(`/auth/v1/admin/users/${encodeURIComponent(profile.user_id)}`))?.email
  } catch {
    return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' })
  }
  // Lock by account when the username exists, otherwise by the username tried.
  const lockKey = profile ? profile.user_id : `username:${normalizedUsername}`
  if (accountLocked(lockKey)) {
    security.record(req, 'locked-account-attempt', 'medium', 'Sign-in attempted on a locked staff account')
    return fail(null)
  }
  // Unknown or inactive username: same message and timing as a wrong password.
  if (!profile || !email) return fail(lockKey)

  let session
  try {
    session = await supabase('/auth/v1/token?grant_type=password', { key: anonKey, method: 'POST', body: { email, password } })
  } catch (error) {
    if (error.status >= 500 || error.status === 429 || error.name === 'TimeoutError') return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' })
    return fail(lockKey)
  }
  try {
    if (session.user?.id !== profile.user_id) {
      await revokeSession(session.access_token)
      security.record(req, 'staff-login-identity-mismatch', 'high', 'Password sign-in returned a different account than the username')
      return fail(lockKey)
    }
    if (staffMfaRequired) {
      // Password is correct; the session is only AAL1 and is refused by every
      // staff route until the authenticator code is verified below.
      const ticket = session.access_token
      const verified = (session.user.factors ?? []).find((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
      const device = verified ? await findTrustedDevice(req, profile.user_id) : null
      if (device) {
        // Remembered device: the password is enough on this browser for this account.
        try { await supabase(`/rest/v1/staff_trusted_devices?id=eq.${encodeURIComponent(device.id)}`, { method: 'PATCH', body: { last_used_at: new Date().toISOString() }, prefer: 'return=minimal' }) } catch { /* cosmetic */ }
        loginFailures.delete(lockKey)
        await audit(req, 'staff.login', { actor: session.user, actorName: profile.display_name, detail: { mfa: 'remembered-device' } })
        return res.json({ accessToken: ticket, email: session.user.email, displayName: profile.display_name, username: profile.username, deviceRemembered: true, expiresIn: Number(session.expires_in) || 3600 })
      }
      if (verified) return res.json({ mfa: { step: 'verify', ticket, factorId: verified.id } })
      for (const stale of (session.user.factors ?? []).filter((factor) => factor.status !== 'verified')) {
        try { await supabase(`/auth/v1/factors/${encodeURIComponent(stale.id)}`, { key: anonKey, token: ticket, method: 'DELETE' }) } catch { /* best effort */ }
      }
      const enrolled = await supabase('/auth/v1/factors', {
        key: anonKey, token: ticket, method: 'POST',
        body: { factor_type: 'totp', friendly_name: `IMFORCE staff ${new Date().toISOString().slice(0, 10)} ${crypto.randomUUID().slice(0, 8)}`, issuer: 'IMFORCE' },
      })
      return res.json({ mfa: { step: 'enroll', ticket, factorId: enrolled.id, qrCode: qrCodeDataUrl(enrolled?.totp?.qr_code), secret: enrolled?.totp?.secret ?? null, uri: authenticatorUri(enrolled?.totp?.uri) } })
    }
    loginFailures.delete(lockKey)
    await audit(req, 'staff.login', { actor: session.user, actorName: profile.display_name })
    res.json({ accessToken: session.access_token, email: session.user.email, displayName: profile.display_name, username: profile.username, expiresIn: Number(session.expires_in) || 3600 })
  } catch { res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' }) }
})

// Second step of staff sign-in: check the 6-digit authenticator code.
app.post('/api/staff/mfa/verify', async (req, res) => {
  if (!requireConfig(res)) return
  const { ticket, factorId, code, rememberDevice = false } = req.body || {}
  if (typeof ticket !== 'string' || ticket.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(ticket)
    || typeof factorId !== 'string' || !uuidPattern.test(factorId)
    || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app.' })
  }
  let user
  try { user = await supabase('/auth/v1/user', { key: anonKey, token: ticket }) } catch {
    security.record(req, 'invalid-mfa-ticket', 'medium', 'Two-factor step called with an invalid or expired sign-in ticket')
    return res.status(401).json({ error: 'Your sign-in has expired. Start again with your username and password.' })
  }
  const lockKey = user.id
  if (accountLocked(lockKey)) {
    security.record(req, 'locked-account-attempt', 'medium', 'Two-factor code tried on a locked staff account')
    return res.status(401).json({ error: loginFailureMessage })
  }
  if (!(user.factors ?? []).some((factor) => factor.id === factorId)) {
    security.record(req, 'mfa-factor-mismatch', 'high', 'Two-factor step used a factor that does not belong to the account')
    return res.status(401).json({ error: 'Your sign-in has expired. Start again with your username and password.' })
  }
  let session
  try {
    const challenge = await supabase(`/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, { key: anonKey, token: ticket, method: 'POST', body: {} })
    session = await supabase(`/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, { key: anonKey, token: ticket, method: 'POST', body: { challenge_id: challenge.id, code: code.trim() } })
  } catch (error) {
    if (error.status >= 500 || error.status === 429 || error.name === 'TimeoutError') return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' })
    recordLoginFailure(req, lockKey)
    return res.status(401).json({ error: 'That code is not correct. Codes change every 30 seconds, so check your authenticator app and try again.' })
  }
  loginFailures.delete(lockKey)
  let profile = null
  try { profile = await loadStaffProfile(user.id) } catch { /* name is cosmetic; sign-in still succeeds */ }
  await audit(req, 'staff.login', { actor: session.user ?? user, actorName: profile?.display_name, detail: { mfa: true } })
  let deviceRemembered = false
  if (rememberDevice === true) {
    const token = crypto.randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + trustedDeviceDays * 86_400_000)
    try {
      await supabase('/rest/v1/staff_trusted_devices', {
        method: 'POST', prefer: 'return=minimal',
        body: { user_id: user.id, token_hash: sha256(token), label: describeDevice(req), expires_at: expiresAt.toISOString() },
      })
      setTrustedDeviceCookie(res, token, trustedDeviceDays * 86_400)
      deviceRemembered = true
      await audit(req, 'device.trust', { actor: session.user ?? user, actorName: profile?.display_name, entityType: 'device', detail: { device: describeDevice(req), days: trustedDeviceDays } })
    } catch { /* Sign-in still succeeds; the code will simply be asked again next time. */ }
  }
  res.json({ deviceRemembered, accessToken: session.access_token, email: session.user?.email ?? user.email, displayName: profile?.display_name ?? null, username: profile?.username ?? null, expiresIn: Number(session.expires_in) || 3600 })
})

// Append-only record of staff actions (migration 005). Never blocks the action
// itself: if the write fails, the failure is logged loudly for follow-up.
async function audit(req, action, { actor = req.staffUser, actorName = req.staffProfile?.display_name, entityType = null, entityId = null, detail = {} } = {}) {
  const entry = {
    actor_user_id: actor?.id ?? null,
    actor_email: actor?.email ? String(actor.email).slice(0, 254) : null,
    actor_name: actorName ? String(actorName).slice(0, 80) : null,
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId).slice(0, 64) : null,
    ip_address: String(req.ip || '').slice(0, 64),
    detail,
  }
  try {
    await supabase('/rest/v1/staff_audit_log', { method: 'POST', body: entry, prefer: 'return=minimal' })
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message: 'Audit log write failed', action, status: error.status ?? null }))
  }
}

async function revokeSession(token) {
  try { await supabase('/auth/v1/logout?scope=local', { key: anonKey, token, method: 'POST' }) }
  catch { /* The token still expires on its own; sign-out is best effort. */ }
}

app.post('/api/staff/logout', requireStaff, async (req, res) => {
  await revokeSession(req.staffToken)
  await audit(req, 'staff.logout')
  res.json({ ok: true })
})

app.get('/api/staff/me', requireStaff, (req, res) => res.json({ email: req.staffUser.email, displayName: req.staffProfile.display_name, username: req.staffProfile.username, deviceRemembered: Boolean(req.trustedDevice) }))

// Stop remembering this browser (or every browser, with {"scope":"all"}).
app.post('/api/staff/devices/forget', requireStaff, async (req, res) => {
  const all = req.body?.scope === 'all'
  const filter = all
    ? `user_id=eq.${encodeURIComponent(req.staffUser.id)}&revoked_at=is.null`
    : (() => {
      const token = readCookie(req, trustedDeviceCookie)
      return /^[A-Za-z0-9_-]{43}$/.test(token) ? `token_hash=eq.${sha256(token)}&user_id=eq.${encodeURIComponent(req.staffUser.id)}&revoked_at=is.null` : null
    })()
  try {
    if (filter) await supabase(`/rest/v1/staff_trusted_devices?${filter}`, { method: 'PATCH', body: { revoked_at: new Date().toISOString() }, prefer: 'return=minimal' })
  } catch { return res.status(502).json({ error: 'The device could not be forgotten. Please try again.' }) }
  setTrustedDeviceCookie(res, '', 0)
  await audit(req, 'device.forget', { entityType: 'device', detail: { scope: all ? 'all' : 'this-device' } })
  res.json({ ok: true })
})
app.get('/api/staff/vacancies', requireStaff, async (_req, res) => {
  try {
    const rows = await supabase('/rest/v1/vacancies?select=*&order=created_at.desc')
    res.json({ vacancies: rows.map(toVacancy) })
  } catch { res.status(502).json({ error: 'Vacancies could not be loaded.' }) }
})
app.get('/api/staff/inquiries', requireStaff, async (req, res) => {
  try {
    const [contacts, employers] = await Promise.all([
      supabase('/rest/v1/contact_inquiries?select=id,name,email,phone,enquiry_type,subject,message,created_at&order=created_at.desc&limit=100'),
      // Review columns come from migration 008; fall back gracefully if it has not run yet.
      supabase('/rest/v1/employer_inquiries?select=id,details,created_at,review_status,reviewed_by_name,reviewed_at,review_reason,vacancy_id&order=created_at.desc&limit=200')
        .catch(() => supabase('/rest/v1/employer_inquiries?select=id,details,created_at&order=created_at.desc&limit=200')),
    ])
    // Latest "request changes" link per job order (migration 009); never the token itself.
    const changeRequests = await supabase('/rest/v1/job_order_change_requests?select=order_id,reason,requested_by_name,requested_at,expires_at,email_status,emailed_at,responded_at,revoked_at&order=requested_at.desc&limit=1000').catch(() => [])
    const latestChange = new Map()
    for (const row of changeRequests) if (!latestChange.has(row.order_id)) latestChange.set(row.order_id, row)
    const paymentLinks = await supabase('/rest/v1/job_order_payment_links?select=order_id,created_by_name,created_at,expires_at,email_status,emailed_at,revoked_at&purpose=eq.staff&order=created_at.desc&limit=1000').catch(() => [])
    const latestPaymentLink = new Map()
    for (const row of paymentLinks) if (!latestPaymentLink.has(row.order_id)) latestPaymentLink.set(row.order_id, row)
    const inquiries = [...contacts.map((item) => ({ ...item, kind: 'contact' })), ...employers.map((item) => ({ ...item, kind: 'employer', change_request: latestChange.get(item.id) ?? null, payment_link: latestPaymentLink.get(item.id) ?? null }))]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    // Enquiries hold personal information, so viewing them is itself audited (POPIA accountability).
    await audit(req, 'enquiries.view', { entityType: 'enquiries', detail: { count: inquiries.length } })
    res.json({ inquiries })
  } catch { res.status(502).json({ error: 'Enquiries could not be loaded.' }) }
})

app.post('/api/staff/vacancies', requireStaff, async (req, res) => {
  try {
    const [row] = await supabase('/rest/v1/vacancies', { method: 'POST', body: fromVacancy(req.body), prefer: 'return=representation' })
    await audit(req, 'vacancy.create', { entityType: 'vacancy', entityId: row.id, detail: { title: row.title, client: row.client_name } })
    res.status(201).json({ vacancy: toVacancy(row) })
  } catch (error) { res.status(error.status === 400 ? 400 : 502).json({ error: error.status === 400 ? error.message : 'Vacancy could not be saved.' }) }
})
// Advert review: an IMFORCE team member approves a paid job order before it
// goes online, or asks the employer for changes. Job orders are never rejected:
// the employer is always given the chance to fix the advert.
// --- "Request changes": private, one-time link for the employer -------------
const changeLinkDays = 7
const changeTokenPattern = /^[A-Za-z0-9_-]{43}$/
const orderReference = (id) => `ORD-${String(id).replace(/-/g, '').slice(0, 8).toUpperCase()}`
// Fields the employer may edit through the link (not their email, not payment data).
const employerEditableFields = Object.keys(employerFieldLabels).filter((field) => field !== 'email' && field !== 'authorizedContact')

async function revokeChangeLinks(orderId) {
  await supabase(`/rest/v1/job_order_change_requests?order_id=eq.${encodeURIComponent(orderId)}&revoked_at=is.null&responded_at=is.null`, {
    method: 'PATCH', body: { revoked_at: new Date().toISOString() }, prefer: 'return=minimal',
  }).catch(() => { /* table may not exist before migration 009 */ })
}

const formatLongDate = (date) => new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
const contactLine = 'If you have any questions, reply to this email or call 033 492 0600.'

// One layout for every employer email: plain text plus simple, escaped HTML.
function employerEmail(order, { intro = [], quote = '', button = null, footnote = '', after = [] }) {
  const name = String(order.details?.contactName ?? '').split(/\s+/)[0] || 'there'
  const text = [
    `Hello ${name},`, '',
    ...intro.flatMap((line) => [line, '']),
    ...(quote ? [quote, ''] : []),
    ...(button ? [`${button.label}: ${button.href}`, ''] : []),
    ...(footnote ? [footnote, ''] : []),
    ...[...after, contactLine].flatMap((line) => [line, '']),
    'IMFORCE Talent Recruitment',
  ].join('\n')
  const paragraph = (line) => `<p>${escapeHtml(line)}</p>`
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#15191f;max-width:560px">
<p>Hello ${escapeHtml(name)},</p>
${intro.map(paragraph).join('\n')}
${quote ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #e2a93b;background:#fff8e8;white-space:pre-line">${escapeHtml(quote)}</blockquote>` : ''}
${button ? `<p><a href="${escapeHtml(button.href)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#012e6f;color:#ffffff;text-decoration:none;font-weight:bold">${escapeHtml(button.label)}</a></p>` : ''}
${footnote ? `<p style="color:#5b6575;font-size:13px">${escapeHtml(footnote)}</p>` : ''}
${[...after, contactLine].map(paragraph).join('\n')}
<p>IMFORCE Talent Recruitment</p></div>`
  return { text, html }
}
const sendEmployerEmail = (order, subject, content) =>
  mailer.send({ to: String(order.details?.email ?? ''), subject, ...employerEmail(order, content) })

// "Request changes" email with the private update link.
function changeRequestEmail(order, reason, link, expiresAt) {
  const title = String(order.details?.jobTitle ?? 'your job order')
  const reference = orderReference(order.id)
  const footnote = `This private link works once and expires on ${formatLongDate(expiresAt)}. Do not forward it.`
  return {
    subject: `Changes needed to your IMFORCE job advert: ${title}`,
    content: {
      intro: [`Thank you for your job order for "${title}" (reference ${reference}). Before we publish the advert, our team needs a few changes:`],
      quote: reason,
      button: { label: 'Update my job order', href: link },
      footnote,
      after: ['You do not need to pay again.'],
    },
  }
}

// Creates a new link (revoking any earlier one), emails it, and reports the result.
// The link itself is only returned to staff when the email was NOT sent, so they can send it.
async function issueChangeLink(req, order, reason) {
  await revokeChangeLinks(order.id)
  const token = crypto.randomBytes(32).toString('base64url')
  const requestedAt = new Date()
  const expiresAt = new Date(requestedAt.getTime() + changeLinkDays * 86_400_000)
  const [request] = await supabase('/rest/v1/job_order_change_requests', {
    method: 'POST', prefer: 'return=representation',
    body: {
      order_id: order.id, token_hash: sha256(token), reason,
      requested_by: req.staffUser.id, requested_by_name: req.staffProfile.display_name,
      requested_at: requestedAt.toISOString(), expires_at: expiresAt.toISOString(),
    },
  })
  // The token goes after '#', so it is never sent to servers, logs or analytics.
  const link = `${publicSiteUrl}/employers/update-job-order#token=${token}`
  const email = changeRequestEmail(order, reason, link, expiresAt)
  const { status } = await sendEmployerEmail(order, email.subject, email.content)
  await supabase(`/rest/v1/job_order_change_requests?id=eq.${encodeURIComponent(request.id)}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { email_status: status, emailed_at: status === 'sent' ? new Date().toISOString() : null },
  }).catch(() => {})
  return { emailStatus: status, sentTo: order.details?.email ?? null, expiresAt: expiresAt.toISOString(), link: status === 'sent' ? null : link }
}

const reviewDecisions = {
  approve: { status: 'approved', action: 'advert.approve' },
  changes: { status: 'changes_requested', action: 'advert.request_changes' },
  reopen: { status: 'pending', action: 'advert.reopen' },
}

app.post('/api/staff/job-orders/:id/review', requireStaff, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    security.record(req, 'invalid-record-id', 'medium', 'Job order review called with a non-UUID id')
    return res.status(404).json({ error: 'Job order not found.' })
  }
  const decision = reviewDecisions[req.body?.decision]
  if (!decision) return res.status(400).json({ error: 'Choose approve, request changes or move back to review.' })
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (decision.status === 'changes_requested' && (reason.length < 5 || reason.length > 1000)) {
    return res.status(400).json({ error: 'Explain the decision in 5 to 1,000 characters so the team and the employer know what to do next.' })
  }
  let vacancyRow = null
  if (decision.status === 'approved') {
    try { vacancyRow = fromVacancy(req.body?.vacancy) } catch (error) { return res.status(400).json({ error: error.message }) }
  }
  const id = encodeURIComponent(req.params.id)
  let order
  try {
    ;[order] = await supabase(`/rest/v1/employer_inquiries?id=eq.${id}&select=id,details,review_status`)
  } catch { return res.status(502).json({ error: 'The job order could not be loaded.' }) }
  if (!order) return res.status(404).json({ error: 'Job order not found.' })
  if (decision.status === 'approved' && order.details?.paymentStatus !== 'paid') {
    return res.status(409).json({ error: 'This job order has not been paid yet. It can be approved once the activation fee is confirmed.' })
  }
  const allowedFrom = decision.status === 'pending' ? ['changes_requested', 'rejected'] : ['pending']
  if (!allowedFrom.includes(order.review_status)) {
    return res.status(409).json({ error: 'Someone has already reviewed this job order. Refresh to see the latest status.' })
  }

  const review = decision.status === 'pending'
    ? { review_status: 'pending', reviewed_by: null, reviewed_by_name: null, reviewed_at: null, review_reason: null }
    : { review_status: decision.status, reviewed_by: req.staffUser.id, reviewed_by_name: req.staffProfile.display_name, reviewed_at: new Date().toISOString(), review_reason: reason || null }
  try {
    // Conditional update: only succeeds if nobody else changed the status meanwhile.
    const claimed = await supabase(`/rest/v1/employer_inquiries?id=eq.${id}&review_status=eq.${order.review_status}`, { method: 'PATCH', body: review, prefer: 'return=representation' })
    if (!claimed?.length) return res.status(409).json({ error: 'Someone has already reviewed this job order. Refresh to see the latest status.' })
  } catch { return res.status(502).json({ error: 'The review could not be saved. Please try again.' }) }

  let vacancy = null
  if (vacancyRow) {
    try {
      ;[vacancy] = await supabase('/rest/v1/vacancies', { method: 'POST', body: vacancyRow, prefer: 'return=representation' })
      await supabase(`/rest/v1/employer_inquiries?id=eq.${id}`, { method: 'PATCH', body: { vacancy_id: vacancy.id }, prefer: 'return=minimal' })
    } catch {
      // Put the order back in the queue so it is not marked approved without an advert.
      try {
        if (vacancy?.id) await supabase(`/rest/v1/vacancies?id=eq.${encodeURIComponent(vacancy.id)}`, { method: 'DELETE', prefer: 'return=minimal' })
        await supabase(`/rest/v1/employer_inquiries?id=eq.${id}`, { method: 'PATCH', body: { review_status: 'pending', reviewed_by: null, reviewed_by_name: null, reviewed_at: null, review_reason: null }, prefer: 'return=minimal' })
      } catch { /* logged below */ }
      console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message: 'Advert approval failed while publishing; order returned to the queue', order: req.params.id }))
      return res.status(502).json({ error: 'The advert could not be published. The job order is back in the review queue; please try again.' })
    }
  }
  // Changes requested: the employer gets the reason and a private link to
  // update and resubmit the job order (no new payment needed).
  let changeLink = null
  let employerEmailStatus = null
  if (decision.status === 'changes_requested') {
    try { changeLink = await issueChangeLink(req, { ...order, id: req.params.id }, reason) }
    catch { changeLink = { emailStatus: 'failed', error: 'The update link could not be created. Use "Send a new link" to try again.' } }
  } else {
    await revokeChangeLinks(req.params.id)
  }
  if (decision.status === 'approved') await revokePaymentLinks(req.params.id)
  if (vacancy) {
    // Tell the employer their advert is live.
    const title = String(vacancy.title ?? order.details?.jobTitle ?? 'your job advert')
    employerEmailStatus = (await sendEmployerEmail({ ...order, id: req.params.id }, `Your job advert is live: ${title}`, {
      intro: [`Good news: your advert for "${title}" (reference ${orderReference(req.params.id)}) has been approved and is now live on the IMFORCE careers page.`],
      button: { label: 'View your advert', href: `${publicSiteUrl}/careers#job-${vacancy.id}` },
      after: ['Our team will be in touch about suitable candidates.'],
    })).status
  }
  await audit(req, decision.action, {
    entityType: 'job_order', entityId: req.params.id,
    detail: { title: vacancy?.title ?? order.details?.jobTitle ?? null, company: order.details?.legalName ?? null, ...(reason ? { reason: reason.slice(0, 300) } : {}), ...(changeLink ? { email: changeLink.emailStatus } : {}), ...(employerEmailStatus ? { email: employerEmailStatus } : {}) },
  })
  res.json({ reviewStatus: review.review_status, vacancy: vacancy ? toVacancy(vacancy) : null, changeLink, employerEmail: employerEmailStatus })
})

// Staff: send the employer a new link (e.g. the first expired or the email bounced).
app.post('/api/staff/job-orders/:id/change-link', requireStaff, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(404).json({ error: 'Job order not found.' })
  const id = encodeURIComponent(req.params.id)
  let order
  try { ;[order] = await supabase(`/rest/v1/employer_inquiries?id=eq.${id}&select=id,details,review_status,review_reason`) }
  catch { return res.status(502).json({ error: 'The job order could not be loaded.' }) }
  if (!order) return res.status(404).json({ error: 'Job order not found.' })
  if (order.review_status !== 'changes_requested' || !order.review_reason) {
    return res.status(409).json({ error: 'A new link can only be sent while changes are requested.' })
  }
  try {
    const changeLink = await issueChangeLink(req, order, order.review_reason)
    await audit(req, 'advert.change_link_resent', { entityType: 'job_order', entityId: req.params.id, detail: { title: order.details?.jobTitle ?? null, company: order.details?.legalName ?? null, email: changeLink.emailStatus } })
    res.json({ changeLink })
  } catch { res.status(502).json({ error: 'A new link could not be created. Please try again.' }) }
})

// Staff: email the employer a private link to pay for an unpaid job order.
app.post('/api/staff/job-orders/:id/payment-link', requireStaff, async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(404).json({ error: 'Job order not found.' })
  let order
  try { ;[order] = await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(req.params.id)}&select=id,details,review_status`) }
  catch { return res.status(502).json({ error: 'The job order could not be loaded.' }) }
  if (!order) return res.status(404).json({ error: 'Job order not found.' })
  if (order.details?.paymentStatus === 'paid') return res.status(409).json({ error: 'This job order is already paid.' })
  if (order.review_status === 'rejected') return res.status(409).json({ error: 'This job order is closed. Move it back to review first.' })
  try {
    await revokePaymentLinks(order.id, 'staff')
    const { token, link } = await createPaymentLink(order.id, 'staff', { id: req.staffUser.id, name: req.staffProfile.display_name })
    const url = `${publicSiteUrl}/employers/complete-payment#token=${token}`
    const title = String(order.details?.jobTitle ?? 'your job order')
    const expiresAt = new Date(link.expires_at)
    const { status } = await sendEmployerEmail(order, `Complete the payment for your IMFORCE job order: ${title}`, {
      intro: [
        `Your job order for "${title}" (reference ${orderReference(order.id)}) is saved, but the ZAR 499 activation fee has not been paid yet.`,
        'Our team reviews your advert as soon as the fee is paid, within 1 business day.',
      ],
      button: { label: 'Pay ZAR 499 securely', href: url },
      footnote: `This private link expires on ${formatLongDate(expiresAt)}. Payment is processed securely by Paystack.`,
    })
    await supabase(`/rest/v1/job_order_payment_links?id=eq.${encodeURIComponent(link.id)}`, {
      method: 'PATCH', prefer: 'return=minimal', body: { email_status: status, emailed_at: status === 'sent' ? new Date().toISOString() : null },
    }).catch(() => {})
    await audit(req, 'payment.link_sent', { entityType: 'job_order', entityId: order.id, detail: { title, company: order.details?.legalName ?? null, email: status } })
    res.json({ paymentLink: { emailStatus: status, sentTo: order.details?.email ?? null, expiresAt: link.expires_at, link: status === 'sent' ? null : url } })
  } catch { res.status(502).json({ error: 'The payment link could not be created. Please try again.' }) }
})

// Employer: open or submit an update using the private link.
const invalidChangeLink = 'This link is invalid, has expired or has already been used. Ask IMFORCE to send you a new one.'

async function findOpenChangeRequest(req, token) {
  if (typeof token !== 'string' || !changeTokenPattern.test(token)) return null
  const query = new URLSearchParams({
    select: 'id,order_id,reason,requested_at,expires_at', token_hash: `eq.${sha256(token)}`,
    responded_at: 'is.null', revoked_at: 'is.null', expires_at: `gt.${new Date().toISOString()}`, limit: '1',
  })
  const [request] = await supabase(`/rest/v1/job_order_change_requests?${query}`)
  if (!request) return null
  const [order] = await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(request.order_id)}&select=id,details,review_status`)
  return order?.review_status === 'changes_requested' ? { request, order } : null
}

const editableView = (details) => ({
  ...Object.fromEntries(employerEditableFields.map((field) => [field, typeof details?.[field] === 'string' ? details[field] : ''])),
  email: details?.email ?? '',
})

app.post('/api/job-order-changes/open', async (req, res) => {
  if (!requireConfig(res)) return
  let found
  try { found = await findOpenChangeRequest(req, req.body?.token) } catch { return res.status(502).json({ error: 'Your job order could not be loaded. Please try again shortly.' }) }
  if (!found) {
    security.record(req, 'invalid-change-link', 'low', 'Job order update link that is invalid, expired or used')
    return res.status(404).json({ error: invalidChangeLink })
  }
  res.set('Cache-Control', 'no-store')
  res.json({
    reference: orderReference(found.order.id),
    reason: found.request.reason,
    requestedAt: found.request.requested_at,
    expiresAt: found.request.expires_at,
    details: editableView(found.order.details),
  })
})

app.post('/api/job-order-changes/submit', async (req, res) => {
  if (!requireConfig(res)) return
  let found
  try { found = await findOpenChangeRequest(req, req.body?.token) } catch { return res.status(502).json({ error: 'Your changes could not be saved. Please try again shortly.' }) }
  if (!found) {
    security.record(req, 'invalid-change-link', 'low', 'Job order update submitted with an invalid, expired or used link')
    return res.status(404).json({ error: invalidChangeLink })
  }
  const submitted = req.body?.details
  if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) return res.status(400).json({ error: 'Your changes were not received correctly. Please try again.' })
  const unexpected = Object.keys(submitted).filter((field) => !employerEditableFields.includes(field) && field !== 'authorizedContact')
  if (unexpected.length) return res.status(400).json({ error: 'The update contains fields that cannot be changed here.', errors: [{ field: 'details', message: 'Only the visible fields can be changed.' }] })
  const { order, request } = found
  // Locked: the contact email the link was sent to, and all payment data.
  const candidate = { ...editableView(order.details), ...submitted, email: order.details.email, authorizedContact: submitted.authorizedContact === true }
  const validation = validateEmployerOrder(Object.fromEntries(Object.entries(candidate).filter(([field, value]) => field in employerFieldLabels && (value !== '' || field === 'email'))))
  if (validation) return res.status(400).json(validation)

  // Use the link once: claim it before changing the order.
  const claimed = await supabase(`/rest/v1/job_order_change_requests?id=eq.${encodeURIComponent(request.id)}&responded_at=is.null&revoked_at=is.null`, {
    method: 'PATCH', body: { responded_at: new Date().toISOString() }, prefer: 'return=representation',
  }).catch(() => [])
  if (!claimed?.length) return res.status(404).json({ error: invalidChangeLink })

  const updatedDetails = { ...order.details }
  for (const field of employerEditableFields) updatedDetails[field] = typeof candidate[field] === 'string' ? candidate[field].trim() : ''
  updatedDetails.authorizedContact = true
  // What the employer changed, so staff do not have to re-read the whole order.
  updatedDetails.lastChangedFields = employerEditableFields
    .filter((field) => String(order.details?.[field] ?? '').trim() !== String(updatedDetails[field] ?? ''))
    .map((field) => employerFieldLabels[field])
  updatedDetails.resubmittedAt = new Date().toISOString()
  updatedDetails.lastChangeRequest = String(request.reason).slice(0, 1000)
  try {
    const updated = await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(order.id)}&review_status=eq.changes_requested`, {
      method: 'PATCH', prefer: 'return=representation',
      body: { details: updatedDetails, review_status: 'pending', reviewed_by: null, reviewed_by_name: null, reviewed_at: null, review_reason: null },
    })
    if (!updated?.length) throw new Error('not updated')
  } catch {
    // Give the employer their link back so they can try again.
    await supabase(`/rest/v1/job_order_change_requests?id=eq.${encodeURIComponent(request.id)}`, { method: 'PATCH', body: { responded_at: null }, prefer: 'return=minimal' }).catch(() => {})
    return res.status(502).json({ error: 'Your changes could not be saved. Please try again in a moment.' })
  }
  const company = String(order.details?.legalName ?? 'Employer').slice(0, 60)
  await audit(req, 'advert.resubmitted', {
    actor: { id: null, email: order.details?.email ?? null }, actorName: `${company} (employer)`,
    entityType: 'job_order', entityId: order.id,
    detail: { title: updatedDetails.jobTitle ?? null, company, changedFields: updatedDetails.lastChangedFields },
  })
  res.json({ ok: true, reference: orderReference(order.id) })
})

app.get('/api/staff/audit', requireStaff, async (_req, res) => {
  try {
    const entries = await supabase('/rest/v1/staff_audit_log?select=occurred_at,actor_email,actor_name,action,entity_type,entity_id,detail&order=occurred_at.desc&limit=500')
    res.json({ entries })
  } catch { res.status(502).json({ error: 'The activity log could not be loaded.' }) }
})

function requireVacancyId(req, res, next) {
  if (!uuidPattern.test(req.params.id)) {
    security.record(req, 'invalid-record-id', 'medium', 'Staff vacancy route called with a non-UUID id')
    return res.status(404).json({ error: 'Vacancy not found.' })
  }
  next()
}

app.put('/api/staff/vacancies/:id', requireStaff, requireVacancyId, async (req, res) => {
  try {
    const changes = fromVacancy(req.body)
    const [before] = await supabase(`/rest/v1/vacancies?id=eq.${encodeURIComponent(req.params.id)}&select=*`)
    if (!before) return res.status(404).json({ error: 'Vacancy not found.' })
    const rows = await supabase(`/rest/v1/vacancies?id=eq.${encodeURIComponent(req.params.id)}`, { method: 'PATCH', body: changes, prefer: 'return=representation' })
    if (!rows.length) return res.status(404).json({ error: 'Vacancy not found.' })
    const changedFields = Object.keys(changes).filter((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(rows[0][key] ?? null))
    await audit(req, 'vacancy.update', { entityType: 'vacancy', entityId: req.params.id, detail: { title: rows[0].title, changedFields } })
    res.json({ vacancy: toVacancy(rows[0]) })
  } catch (error) { res.status(error.status === 400 ? 400 : 502).json({ error: error.status === 400 ? error.message : 'Vacancy could not be updated.' }) }
})
app.delete('/api/staff/vacancies/:id', requireStaff, requireVacancyId, async (req, res) => {
  try {
    const rows = await supabase(`/rest/v1/vacancies?id=eq.${encodeURIComponent(req.params.id)}&select=id,title,client_name`, { method: 'DELETE', prefer: 'return=representation' })
    if (!rows?.length) return res.status(404).json({ error: 'Vacancy not found.' })
    await audit(req, 'vacancy.delete', { entityType: 'vacancy', entityId: req.params.id, detail: { title: rows[0].title, client: rows[0].client_name } })
    res.json({ ok: true })
  } catch { res.status(502).json({ error: 'Vacancy could not be deleted.' }) }
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))
app.use((_req, res) => res.status(404).json({ error: 'Not found.' }))

app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'The request is too large.' })
  if (error instanceof SyntaxError || error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON.' })
  console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message: String(error?.message ?? error).slice(0, 300) }))
  res.status(500).json({ error: 'Unexpected server error.' })
})

if (require.main === module) {
  const server = app.listen(port, () => console.log(`IMFORCE API listening on ${port}`))
  // Finish in-flight requests (for example a payment verification) before exiting on deploy/restart.
  const shutdown = (signal) => {
    console.log(`${signal} received: closing the API gracefully.`)
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('unhandledRejection', (reason) => {
    console.error(JSON.stringify({ level: 'error', at: new Date().toISOString(), message: 'Unhandled promise rejection', detail: String(reason?.message ?? reason).slice(0, 300) }))
  })
}

module.exports = { app, security, isEmail, mailer }
