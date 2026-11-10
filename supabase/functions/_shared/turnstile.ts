type TurnstileVerificationResponse = {
  success: boolean
  action?: string
  hostname?: string
}

export async function verifyTurnstileToken(
  token: string,
  expectedAction: 'contact' | 'job-order',
  origin: string,
) {
  if (!token || token.length > 2048) return false

  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (!secret) {
    throw new Error('TURNSTILE_SECRET_KEY is not configured.')
  }

  const expectedHostnames = new Set(
    (Deno.env.get('TURNSTILE_HOSTNAMES') ?? '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  )
  if (expectedHostnames.size === 0) {
    throw new Error('TURNSTILE_HOSTNAMES is not configured.')
  }
  if ((Deno.env.get('ALLOW_LOCAL_ORIGINS') ?? '').toLowerCase() === 'true') {
    expectedHostnames.add('localhost')
    expectedHostnames.add('127.0.0.1')
  }

  let hostname: string
  try {
    hostname = new URL(origin).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!expectedHostnames.has(hostname)) return false

  const body = new URLSearchParams({ secret, response: token })
  const result = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!result.ok) {
    throw new Error(`Turnstile Siteverify returned HTTP ${result.status}.`)
  }

  const payload: unknown = await result.json()
  if (typeof payload !== 'object' || payload === null || !('success' in payload)) {
    throw new Error('Turnstile Siteverify returned an invalid response.')
  }

  const verification = payload as TurnstileVerificationResponse
  return (
    verification.success === true &&
    verification.action === expectedAction &&
    verification.hostname === hostname
  )
}
