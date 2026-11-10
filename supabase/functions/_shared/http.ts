const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowLocalOrigins =
  (Deno.env.get('ALLOW_LOCAL_ORIGINS') ?? '').toLowerCase() === 'true'

const localOrigins = allowLocalOrigins
  ? [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ]
  : []

export const allowedOrigins = [
  ...new Set([...configuredOrigins, ...localOrigins]),
]

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
) {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('access-control-allow-origin', origin)
    headers.set('access-control-allow-methods', 'POST, OPTIONS')
    headers.set(
      'access-control-allow-headers',
      'authorization, apikey, x-client-info, content-type',
    )
    headers.set('vary', 'Origin')
  }
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers,
  })
}
