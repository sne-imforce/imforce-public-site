require('dotenv').config()
const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const { createSecurityMonitor } = require('./security')

const app = express()
const port = Number(process.env.PORT || 3001)
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '')
const anonKey = process.env.SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY
const paystackWebhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET
const configuredOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim())
const paystackCallbackUrl = process.env.PAYSTACK_CALLBACK_URL || `${configuredOrigins[0].replace(/\/$/, '')}/employers`
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
app.use(cors({ origin: allowedOrigins }))
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
    const profiles = await supabase(`/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=user_id`)
    if (!profiles.length) {
      security.record(req, 'non-staff-token', 'high', 'Valid account without an active staff profile called a staff route')
      return res.status(403).json({ error: 'This account is not authorized for staff access.' })
    }
    if (staffMfaRequired && tokenClaims(token).aal !== 'aal2') {
      security.record(req, 'staff-token-without-mfa', 'medium', 'Staff route called with a session that has not completed two-factor sign-in')
      return res.status(401).json({ error: 'Two-factor sign-in is required. Sign in again.' })
    }
    req.staffUser = user
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
    await supabase('/rest/v1/contact_inquiries', { method: 'POST', body: { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), enquiry_type: enquiryType, subject: subject.trim(), message: message.trim() }, prefer: 'return=minimal' })
    res.status(201).json({ ok: true })
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
  const query = new URLSearchParams({
    select: 'id,details',
    'details->>paymentReference': `eq.${reference}`,
    limit: '1',
  })
  const rows = await supabase(`/rest/v1/employer_inquiries?${query.toString()}`)
  return rows[0] ?? null
}

async function confirmPaystackPayment(reference) {
  const record = await findEmployerOrderByPaymentReference(reference)
  if (!record) return { found: false, paid: false }
  const details = record.details
  if (details.paymentStatus === 'paid') return { found: true, paid: true }

  const transaction = await verifyPaystackTransaction(reference)
  const isPaid = transaction.status === 'success'
    && transaction.reference === reference
    && transaction.amount === activationFeeMinor
    && transaction.currency === activationFeeCurrency
    && transaction.customer?.email?.toLowerCase() === details.email?.toLowerCase()
  if (!isPaid) return { found: true, paid: false }

  const paymentDetails = {
    ...details,
    paymentStatus: 'paid',
    paymentAmountMinor: activationFeeMinor,
    paymentCurrency: activationFeeCurrency,
    paymentPaidAt: transaction.paid_at ?? new Date().toISOString(),
    paymentChannel: typeof transaction.channel === 'string' ? transaction.channel : null,
    paystackTransactionId: String(transaction.id),
  }
  await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(record.id)}`, {
    method: 'PATCH',
    body: { details: paymentDetails },
    prefer: 'return=minimal',
  })
  return { found: true, paid: true }
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

  const reference = `IMF-${crypto.randomUUID()}`
  const pendingDetails = {
    ...details,
    email: details.email.trim().toLowerCase(),
    paymentStatus: 'initializing',
    paymentReference: reference,
    paymentAmountMinor: activationFeeMinor,
    paymentCurrency: activationFeeCurrency,
  }
  let inquiry
  try {
    const saved = await supabase('/rest/v1/employer_inquiries', {
      method: 'POST',
      body: { details: pendingDetails },
      prefer: 'return=representation',
    })
    inquiry = saved[0]
    if (!inquiry?.id) throw new Error('The job order record was not returned.')
  } catch {
    return res.status(502).json({ error: 'We could not save the job order securely. Please try again.' })
  }

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: paystackHeaders(),
      body: JSON.stringify({
        email: pendingDetails.email,
        amount: String(activationFeeMinor),
        currency: activationFeeCurrency,
        reference,
        callback_url: paystackCallbackUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const result = await response.json().catch(() => null)
    const authorizationUrl = result?.data?.authorization_url
    let isPaystackCheckout = false
    try {
      const parsed = new URL(authorizationUrl)
      isPaystackCheckout = parsed.protocol === 'https:' && parsed.hostname === 'checkout.paystack.com'
    } catch { isPaystackCheckout = false }
    if (!response.ok || result?.status !== true || !isPaystackCheckout || result.data.reference !== reference) {
      throw new Error('Paystack did not return a valid checkout URL.')
    }
    await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(inquiry.id)}`, {
      method: 'PATCH',
      body: { details: { ...pendingDetails, paymentStatus: 'pending' } },
      prefer: 'return=minimal',
    })
    return res.status(201).json({ authorizationUrl, reference })
  } catch {
    try {
      await supabase(`/rest/v1/employer_inquiries?id=eq.${encodeURIComponent(inquiry.id)}`, {
        method: 'PATCH',
        body: { details: { ...pendingDetails, paymentStatus: 'initialization_failed' } },
        prefer: 'return=minimal',
      })
    } catch { /* Keep the original checkout error response. */ }
    return res.status(502).json({ error: 'Paystack checkout could not be started. Your job order was saved; please try checkout again.' })
  }
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
    return res.json({ paid: true, message: 'Payment received. Your job order was sent to IMFORCE for the next step.' })
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
const loginFailureMessage = 'Email or password is incorrect, or the account is temporarily locked. Try again later or contact your IMFORCE administrator.'

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
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password || email.length > 254 || password.length > 256) return res.status(400).json({ error: 'Enter your staff email and password.' })
  const normalizedEmail = email.trim().toLowerCase()
  if (accountLocked(normalizedEmail)) {
    security.record(req, 'locked-account-attempt', 'medium', 'Sign-in attempted on a locked staff account')
    return res.status(401).json({ error: loginFailureMessage })
  }
  let session
  try {
    session = await supabase('/auth/v1/token?grant_type=password', { key: anonKey, method: 'POST', body: { email: normalizedEmail, password } })
  } catch (error) {
    if (error.status >= 500 || error.status === 429 || error.name === 'TimeoutError') return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' })
    recordLoginFailure(req, normalizedEmail)
    return res.status(401).json({ error: loginFailureMessage })
  }
  try {
    const profiles = await supabase(`/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(session.user.id)}&active=eq.true&select=user_id`)
    if (!profiles.length) {
      // Same response as a wrong password so outsiders cannot discover which
      // emails have site accounts; revoke the session that was just issued.
      await revokeSession(session.access_token)
      security.record(req, 'non-staff-login', 'high', 'Valid non-staff account tried to sign in to the staff portal')
      recordLoginFailure(req, normalizedEmail)
      return res.status(401).json({ error: loginFailureMessage })
    }
    if (staffMfaRequired) {
      // Password is correct; the session is only AAL1 and is refused by every
      // staff route until the authenticator code is verified below.
      const ticket = session.access_token
      const verified = (session.user.factors ?? []).find((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
      if (verified) return res.json({ mfa: { step: 'verify', ticket, factorId: verified.id } })
      for (const stale of (session.user.factors ?? []).filter((factor) => factor.status !== 'verified')) {
        try { await supabase(`/auth/v1/factors/${encodeURIComponent(stale.id)}`, { key: anonKey, token: ticket, method: 'DELETE' }) } catch { /* best effort */ }
      }
      const enrolled = await supabase('/auth/v1/factors', {
        key: anonKey, token: ticket, method: 'POST',
        body: { factor_type: 'totp', friendly_name: `IMFORCE staff ${new Date().toISOString().slice(0, 10)} ${crypto.randomUUID().slice(0, 8)}`, issuer: 'IMFORCE' },
      })
      const qrCode = typeof enrolled?.totp?.qr_code === 'string' && enrolled.totp.qr_code.startsWith('data:image/svg+xml') ? enrolled.totp.qr_code : null
      return res.json({ mfa: { step: 'enroll', ticket, factorId: enrolled.id, qrCode, secret: enrolled?.totp?.secret ?? null } })
    }
    loginFailures.delete(normalizedEmail)
    await audit(req, 'staff.login', { actor: session.user })
    res.json({ accessToken: session.access_token, email: session.user.email, expiresIn: Number(session.expires_in) || 3600 })
  } catch { res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' }) }
})

// Second step of staff sign-in: check the 6-digit authenticator code.
app.post('/api/staff/mfa/verify', async (req, res) => {
  if (!requireConfig(res)) return
  const { ticket, factorId, code } = req.body || {}
  if (typeof ticket !== 'string' || ticket.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(ticket)
    || typeof factorId !== 'string' || !uuidPattern.test(factorId)
    || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return res.status(400).json({ error: 'Enter the 6-digit code from your authenticator app.' })
  }
  let user
  try { user = await supabase('/auth/v1/user', { key: anonKey, token: ticket }) } catch {
    security.record(req, 'invalid-mfa-ticket', 'medium', 'Two-factor step called with an invalid or expired sign-in ticket')
    return res.status(401).json({ error: 'Your sign-in has expired. Start again with your email and password.' })
  }
  const email = String(user.email ?? '').toLowerCase()
  if (accountLocked(email)) {
    security.record(req, 'locked-account-attempt', 'medium', 'Two-factor code tried on a locked staff account')
    return res.status(401).json({ error: loginFailureMessage })
  }
  if (!(user.factors ?? []).some((factor) => factor.id === factorId)) {
    security.record(req, 'mfa-factor-mismatch', 'high', 'Two-factor step used a factor that does not belong to the account')
    return res.status(401).json({ error: 'Your sign-in has expired. Start again with your email and password.' })
  }
  let session
  try {
    const challenge = await supabase(`/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, { key: anonKey, token: ticket, method: 'POST', body: {} })
    session = await supabase(`/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, { key: anonKey, token: ticket, method: 'POST', body: { challenge_id: challenge.id, code: code.trim() } })
  } catch (error) {
    if (error.status >= 500 || error.status === 429 || error.name === 'TimeoutError') return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again shortly.' })
    recordLoginFailure(req, email)
    return res.status(401).json({ error: 'That code is not correct. Codes change every 30 seconds, so check your authenticator app and try again.' })
  }
  loginFailures.delete(email)
  await audit(req, 'staff.login', { actor: session.user ?? user, detail: { mfa: true } })
  res.json({ accessToken: session.access_token, email: session.user?.email ?? user.email, expiresIn: Number(session.expires_in) || 3600 })
})

// Append-only record of staff actions (migration 005). Never blocks the action
// itself: if the write fails, the failure is logged loudly for follow-up.
async function audit(req, action, { actor = req.staffUser, entityType = null, entityId = null, detail = {} } = {}) {
  const entry = {
    actor_user_id: actor?.id ?? null,
    actor_email: actor?.email ? String(actor.email).slice(0, 254) : null,
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

app.get('/api/staff/me', requireStaff, (req, res) => res.json({ email: req.staffUser.email }))
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
      supabase('/rest/v1/employer_inquiries?select=id,details,created_at&order=created_at.desc&limit=100'),
    ])
    const inquiries = [...contacts.map((item) => ({ ...item, kind: 'contact' })), ...employers.map((item) => ({ ...item, kind: 'employer' }))]
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
app.get('/api/staff/audit', requireStaff, async (_req, res) => {
  try {
    const entries = await supabase('/rest/v1/staff_audit_log?select=occurred_at,actor_email,action,entity_type,entity_id,detail&order=occurred_at.desc&limit=500')
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

module.exports = { app, security, isEmail }
