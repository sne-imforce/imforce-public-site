import {
  payloadContainsHoneytoken,
  recordHoneytokenEvent,
} from '../_shared/honeytoken.ts'

function trapResponse(request: Request, status = 204) {
  const origin = request.headers.get('origin')
  const headers = new Headers()
  headers.set('access-control-allow-origin', origin || '*')
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set(
    'access-control-allow-headers',
    'authorization, apikey, x-client-info, content-type',
  )
  headers.set('cache-control', 'no-store')
  return new Response(null, { status, headers })
}

Deno.serve(async (request) => {
  const url = new URL(request.url)

  try {
    if (request.method === 'OPTIONS') {
      return trapResponse(request)
    }

    if (request.method === 'GET') {
      await recordHoneytokenEvent(request, {
        trapId: (url.searchParams.get('trap') ?? 'canary-get').slice(0, 80),
        path: url.pathname,
        detail: url.search.slice(0, 200),
      })
      return trapResponse(request)
    }

    if (request.method !== 'POST') {
      return trapResponse(request, 405)
    }

    const contentLength = Number(request.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > 4000) {
      return trapResponse(request, 413)
    }

    let trapId = 'path-visit'
    let path = url.pathname
    let detail = ''

    try {
      const parsed: unknown = await request.json()
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const body = parsed as Record<string, unknown>
        if (typeof body.trapId === 'string' && body.trapId.trim()) {
          trapId = body.trapId.trim()
        }
        if (typeof body.path === 'string' && body.path.trim()) {
          path = body.path.trim()
        }
        if (typeof body.detail === 'string') {
          detail = body.detail
        }
        if (payloadContainsHoneytoken(parsed)) {
          trapId = 'stolen-secret'
        }
      }
    } catch {
      trapId = 'malformed-hit'
    }

    const authorization = request.headers.get('authorization') ?? ''
    if (payloadContainsHoneytoken(authorization)) {
      trapId = 'stolen-secret'
      detail = 'Authorization header contained the canary secret.'
    }

    await recordHoneytokenEvent(request, { trapId, path, detail })
    return trapResponse(request)
  } catch (error) {
    console.error(
      'Unexpected honeytoken handler failure:',
      error instanceof Error ? error.message : 'Unknown error',
    )
    return trapResponse(request, 204)
  }
})
