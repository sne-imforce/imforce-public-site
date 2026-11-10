import { createClient } from 'npm:@supabase/supabase-js@2.119.0'
import {
  payloadContainsHoneytoken,
  recordHoneytokenEvent,
} from '../_shared/honeytoken.ts'
import { allowedOrigins, jsonResponse } from '../_shared/http.ts'
import { verifyTurnstileToken } from '../_shared/turnstile.ts'

class ValidationError extends Error {}

function readText(
  value: unknown,
  field: string,
  maximum: number,
  required = true,
) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null || value === '')) {
      return null
    }
    throw new ValidationError(`Invalid ${field}.`)
  }

  const normalized = value.trim()
  if ((!normalized && required) || normalized.length > maximum) {
    throw new ValidationError(`Invalid ${field}.`)
  }
  return normalized || null
}

function readRequiredText(value: unknown, field: string, maximum: number) {
  const result = readText(value, field, maximum)
  if (!result) throw new ValidationError(`Invalid ${field}.`)
  return result
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  try {
    if (!origin || !allowedOrigins.includes(origin)) {
      return jsonResponse(403, { error: 'Origin not allowed.' }, origin)
    }

    if (request.method === 'OPTIONS') {
      return jsonResponse(204, {}, origin)
    }

    if (request.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed.' }, origin)
    }

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      return jsonResponse(415, { error: 'Unsupported content type.' }, origin)
    }

    let rawBody: string
    try {
      rawBody = await request.text()
    } catch {
      return jsonResponse(400, { error: 'Invalid request body.' }, origin)
    }
    if (rawBody.length > 12_000) {
      return jsonResponse(413, { error: 'Submission is too large.' }, origin)
    }

    let input: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(rawBody)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Invalid request body.')
      }
      input = parsed as Record<string, unknown>
    } catch {
      return jsonResponse(400, { error: 'Invalid request body.' }, origin)
    }

    const honeyField =
      typeof input.hp_website === 'string' && input.hp_website.trim()
        ? input.hp_website.trim()
        : null
    if (
      honeyField ||
      payloadContainsHoneytoken(input) ||
      payloadContainsHoneytoken(request.headers.get('authorization'))
    ) {
      await recordHoneytokenEvent(request, {
        trapId: honeyField ? 'form-honeypot' : 'stolen-secret',
        path: '/contact',
        detail: honeyField ? 'Hidden form field was filled.' : 'Canary secret submitted.',
      })
      return jsonResponse(200, { ok: true }, origin)
    }

    let name: string
    let email: string
    let phone: string | null
    let enquiryType: string
    let subject: string
    let message: string
    let turnstileToken: string

    try {
      name = readRequiredText(input.name, 'name', 120)
      email = readRequiredText(input.email, 'email', 254)
      phone = readText(input.phone, 'phone', 40, false)
      enquiryType = readRequiredText(input.enquiryType, 'enquiry type', 80)
      subject = readRequiredText(input.subject, 'subject', 160)
      message = readRequiredText(input.message, 'message', 5000)
      turnstileToken = readRequiredText(input.turnstileToken, 'verification', 2048)
    } catch (error) {
      if (error instanceof ValidationError) {
        return jsonResponse(400, { error: error.message }, origin)
      }
      throw error
    }

    const allowedEnquiryTypes = new Set([
      'Hiring and permanent staffing',
      'Job opportunities',
      'Other enquiry',
    ])
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !allowedEnquiryTypes.has(enquiryType)
    ) {
      return jsonResponse(400, { error: 'Please check the form details.' }, origin)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!Deno.env.get('TURNSTILE_SECRET_KEY') || !supabaseUrl || !serviceRoleKey) {
      console.error('Contact form server configuration is incomplete.')
      return jsonResponse(
        503,
        { error: 'The contact form is temporarily unavailable.' },
        origin,
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
      const verified = await verifyTurnstileToken(turnstileToken, 'contact', origin)
      if (!verified) {
        return jsonResponse(
          400,
          { error: 'Security verification failed. Please try again.' },
          origin,
        )
      }
    } catch (error) {
      console.error(
        'Unable to verify contact Turnstile token:',
        error instanceof Error ? error.message : 'Unknown error',
      )
      return jsonResponse(
        503,
        { error: 'Verification is temporarily unavailable.' },
        origin,
      )
    }

    const { error } = await supabase.from('contact_enquiries').insert({
      name,
      email,
      phone,
      enquiry_type: enquiryType,
      subject,
      message,
    })

    if (error) {
      console.error('Unable to save contact enquiry:', error.message)
      return jsonResponse(
        500,
        { error: 'Unable to send your message. Please try again.' },
        origin,
      )
    }

    return jsonResponse(200, { ok: true }, origin)
  } catch (error) {
    console.error(
      'Unexpected contact enquiry submission failure:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return jsonResponse(
      503,
      { error: 'Unable to send your message right now.' },
      origin,
    )
  }
})
