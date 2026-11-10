import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import {
  payloadContainsHoneytoken,
  recordHoneytokenEvent,
} from '../_shared/honeytoken.ts'
import { allowedOrigins, jsonResponse } from '../_shared/http.ts'
import { verifyTurnstileToken } from '../_shared/turnstile.ts'

const maxRequestSize = 10_600_000
const maxFileSize = 10 * 1024 * 1024
const allowedEmploymentTypes = new Set([
  'Permanent',
  'Contract',
  'Fixed-term',
  'Temporary',
])
const allowedMimeTypes = new Map([
  ['application/pdf', 'pdf'],
  ['application/msword', 'doc'],
  [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'docx',
  ],
])

class ValidationError extends Error {}
class PayloadTooLargeError extends Error {}

function readText(
  form: FormData,
  field: string,
  maximum: number,
  required = true,
) {
  const value = form.get(field)
  if (typeof value !== 'string') {
    if (!required && (value === null || value === '')) return null
    throw new ValidationError(`Invalid ${field}.`)
  }

  const normalized = value.trim()
  if ((!normalized && required) || normalized.length > maximum) {
    throw new ValidationError(`Invalid ${field}.`)
  }
  return normalized || null
}

function readRequiredText(form: FormData, field: string, maximum: number) {
  const result = readText(form, field, maximum)
  if (!result) throw new ValidationError(`Invalid ${field}.`)
  return result
}

async function readBoundedBody(request: Request) {
  if (!request.body) throw new ValidationError('Invalid request body.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxRequestSize) {
        await reader.cancel()
        throw new PayloadTooLargeError()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function sanitizeFilename(name: string, extension: string) {
  const basename = name.split(/[\\/]/).pop() ?? ''
  const cleaned = basename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.[^.]*$/, '')
    .slice(0, 160)
  return `${cleaned || 'job-description'}.${extension}`
}

async function isValidFile(file: File, extension: string) {
  if (file.size === 0 || file.size > maxFileSize) return false
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())

  if (extension === 'pdf') {
    return new TextDecoder().decode(header.slice(0, 5)) === '%PDF-'
  }
  if (extension === 'doc') {
    return [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (byte, index) => header[index] === byte,
    )
  }

  return (
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04
  )
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  try {
  if (!origin || !allowedOrigins.includes(origin)) {
    return jsonResponse(403, { error: 'Origin not allowed.' }, origin)
  }
  if (request.method === 'OPTIONS') return jsonResponse(204, {}, origin)
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' }, origin)
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return jsonResponse(415, { error: 'Unsupported content type.' }, origin)
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxRequestSize) {
    return jsonResponse(413, { error: 'Submission is too large.' }, origin)
  }

  let form: FormData
  try {
    const body = await readBoundedBody(request)
    form = await new Response(body, {
      headers: { 'content-type': contentType },
    }).formData()
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return jsonResponse(413, { error: 'Submission is too large.' }, origin)
    }
    return jsonResponse(400, { error: 'Invalid form submission.' }, origin)
  }

  const honeyRaw = form.get('hp_website')
  const honeyField =
    typeof honeyRaw === 'string' && honeyRaw.trim() ? honeyRaw.trim() : null
  const formValues = [...form.entries()].flatMap(([key, value]) =>
    typeof value === 'string' ? [key, value] : [key],
  )
  if (
    honeyField ||
    payloadContainsHoneytoken(formValues) ||
    payloadContainsHoneytoken(request.headers.get('authorization'))
  ) {
    await recordHoneytokenEvent(request, {
      trapId: honeyField ? 'form-honeypot' : 'stolen-secret',
      path: '/employers',
      detail: honeyField ? 'Hidden form field was filled.' : 'Canary secret submitted.',
    })
    return jsonResponse(200, { ok: true }, origin)
  }

  let legalCompanyName: string
  let tradingName: string | null
  let registrationNumber: string
  let vatNumber: string | null
  let companyAddress: string
  let contactName: string
  let contactEmail: string
  let contactPhone: string
  let billingContact: string
  let billingAddress: string
  let jobTitle: string
  let jobLocation: string
  let numberOfHires: number
  let employmentType: string
  let workingHours: string
  let salaryType: string
  let salary: string
  let closingDate: string
  let duties: string
  let requirements: string
  let qualifications: string
  let authorizedContact: boolean
  let turnstileToken: string
  let attachment: File | null
  let attachmentExtension: string | null
  let attachmentName: string | null

  try {
    legalCompanyName = readRequiredText(form, 'legalCompanyName', 200)
    tradingName = readText(form, 'tradingName', 200, false)
    registrationNumber = readRequiredText(form, 'registrationNumber', 80)
    vatNumber = readText(form, 'vatNumber', 80, false)
    companyAddress = readRequiredText(form, 'companyAddress', 500)
    contactName = readRequiredText(form, 'contactName', 120)
    contactEmail = readRequiredText(form, 'email', 254).toLowerCase()
    contactPhone = readRequiredText(form, 'phone', 40)
    billingContact = readRequiredText(form, 'billingContact', 120)
    billingAddress = readRequiredText(form, 'billingAddress', 500)
    jobTitle = readRequiredText(form, 'jobTitle', 160)
    jobLocation = readRequiredText(form, 'jobLocation', 200)
    const hires = readRequiredText(form, 'numberOfHires', 3)
    numberOfHires = Number(hires)
    employmentType = readRequiredText(form, 'employmentType', 40)
    workingHours = readRequiredText(form, 'workingHours', 120)
    salaryType = readRequiredText(form, 'salaryType', 20)
    salary =
      salaryType === 'market'
        ? 'Market Related Salary'
        : readRequiredText(form, 'salary', 120)
    closingDate = readRequiredText(form, 'closingDate', 10)
    duties = readRequiredText(form, 'duties', 4000)
    requirements = readRequiredText(form, 'requirements', 4000)
    qualifications = readRequiredText(form, 'qualifications', 3000)
    authorizedContact =
      readRequiredText(form, 'authorizedContact', 10) === 'on'
    if (!authorizedContact) {
      throw new ValidationError('Confirm that you are authorized to submit this request.')
    }
    turnstileToken = readRequiredText(form, 'turnstileToken', 2048)

    if (form.getAll('jobDescription').length > 1) {
      throw new ValidationError('Upload only one job description.')
    }

    const fileValue = form.get('jobDescription')
    if (fileValue !== null && typeof fileValue !== 'string' && fileValue.size > 0) {
      attachment = fileValue
      const extension = allowedMimeTypes.get(fileValue.type)
      const filenameExtension = fileValue.name.toLowerCase().split('.').pop()
      if (!extension || filenameExtension !== extension) {
        throw new ValidationError('Upload a DOC, DOCX or PDF job description.')
      }
      attachmentExtension = extension
      attachmentName = sanitizeFilename(fileValue.name, extension)
    } else {
      attachment = null
      attachmentExtension = null
      attachmentName = null
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return jsonResponse(400, { error: error.message }, origin)
    }
    throw error
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
    !/^[1-9]\d{0,2}$/.test(String(numberOfHires)) ||
    numberOfHires < 1 ||
    numberOfHires > 500 ||
    !allowedEmploymentTypes.has(employmentType) ||
    !['specified', 'market'].includes(salaryType) ||
    (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate) ||
      Number.isNaN(new Date(`${closingDate}T00:00:00Z`).getTime()) ||
      new Date(`${closingDate}T00:00:00Z`).toISOString().slice(0, 10) !== closingDate)
  ) {
    return jsonResponse(400, { error: 'Please check the form details.' }, origin)
  }

  if (attachment && attachmentExtension) {
    try {
      if (!(await isValidFile(attachment, attachmentExtension))) {
        return jsonResponse(400, { error: 'The attachment is invalid or too large.' }, origin)
      }
    } catch (error) {
      console.error(
        'Unable to inspect job-order attachment:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      return jsonResponse(400, { error: 'Unable to read the attachment.' }, origin)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!Deno.env.get('TURNSTILE_SECRET_KEY') || !supabaseUrl || !serviceRoleKey) {
    console.error('Job-order server configuration is incomplete.')
    return jsonResponse(503, { error: 'The job-order form is temporarily unavailable.' }, origin)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const verified = await verifyTurnstileToken(
      turnstileToken,
      'job-order',
      origin,
    )
    if (!verified) {
      return jsonResponse(400, { error: 'Security verification failed. Please try again.' }, origin)
    }
  } catch (error) {
    console.error(
      'Unable to verify job-order Turnstile token:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return jsonResponse(503, { error: 'Verification is temporarily unavailable.' }, origin)
  }

  const attachmentPath = attachment
    ? `${crypto.randomUUID()}.${attachmentExtension}`
    : null

  if (attachment && attachmentPath) {
    try {
      const { error } = await supabase.storage
        .from('job-order-files')
        .upload(attachmentPath, attachment, {
          contentType: attachment.type,
          upsert: false,
        })
      if (error) {
        console.error('Unable to store job-order attachment:', error.message)
        const { error: cleanupError } = await supabase.storage
          .from('job-order-files')
          .remove([attachmentPath])
        if (cleanupError) {
          console.error('Unable to remove orphaned job-order attachment:', cleanupError.message)
        }
        return jsonResponse(500, { error: 'Unable to save the attachment. Please try again.' }, origin)
      }
    } catch (error) {
      console.error(
        'Unable to store job-order attachment:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      const { error: cleanupError } = await supabase.storage
        .from('job-order-files')
        .remove([attachmentPath])
      if (cleanupError) {
        console.error('Unable to remove orphaned job-order attachment:', cleanupError.message)
      }
      return jsonResponse(503, { error: 'Unable to save the attachment right now.' }, origin)
    }
  }

  try {
    const { error } = await supabase.from('job_orders').insert({
      legal_company_name: legalCompanyName,
      trading_name: tradingName,
      registration_number: registrationNumber,
      vat_number: vatNumber,
      company_address: companyAddress,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      billing_contact: billingContact,
      billing_address: billingAddress,
      job_title: jobTitle,
      job_location: jobLocation,
      number_of_hires: numberOfHires,
      employment_type: employmentType,
      working_hours: workingHours,
      salary_type: salaryType,
      salary,
      closing_date: closingDate,
      duties,
      requirements,
      qualifications,
      authorized_contact: authorizedContact,
      attachment_path: attachmentPath,
      attachment_name: attachmentName,
    })

    if (error) {
      console.error('Unable to save job order:', error.message)
      if (attachmentPath) {
        const { error: cleanupError } = await supabase.storage
          .from('job-order-files')
          .remove([attachmentPath])
        if (cleanupError) {
          console.error('Unable to remove orphaned job-order attachment:', cleanupError.message)
        }
      }
      return jsonResponse(500, { error: 'Unable to submit the job order. Please try again.' }, origin)
    }

    return jsonResponse(200, { ok: true }, origin)
  } catch (error) {
    console.error(
      'Unexpected job-order submission failure:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    if (attachmentPath) {
      const { error: cleanupError } = await supabase.storage
        .from('job-order-files')
        .remove([attachmentPath])
      if (cleanupError) {
        console.error('Unable to remove orphaned job-order attachment:', cleanupError.message)
      }
    }
    return jsonResponse(503, { error: 'Unable to submit the job order right now.' }, origin)
  }
  } catch (error) {
    console.error(
      'Unexpected job-order handler failure:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return jsonResponse(
      503,
      { error: 'Unable to submit the job order right now.' },
      origin,
    )
  }
})
