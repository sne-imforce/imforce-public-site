require('dotenv').config()
const crypto = require('node:crypto')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

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
}
app.use(helmet())
app.use(cors({ origin: allowedOrigins }))
app.use(express.json({
  limit: '32kb',
  verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer) },
}))

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
  const group = req.path === '/staff/login' ? 'login'
    : req.path === '/payments/paystack/webhook' ? 'webhook'
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
  if (typeof details.email === 'string' && details.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) {
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
    if (!result.found) return res.status(404).json({ error: 'No job order was found for this payment reference. Contact IMFORCE before trying to pay again.' })
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
  if (!isValidPaystackWebhook(req)) return res.sendStatus(401)
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
