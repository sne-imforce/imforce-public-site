import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

export const STOLEN_SECRET_MARKER = 'imf_ht_live_8c2e91b4d7a64f0ab31e55c9'

function serviceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Honeytoken storage is not configured.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function requestClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    forwarded?.split(',')[0]?.trim() ??
    ''
  return ip.slice(0, 80) || 'unknown'
}

export function payloadContainsHoneytoken(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(STOLEN_SECRET_MARKER)
  if (Array.isArray(value)) return value.some(payloadContainsHoneytoken)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(
      payloadContainsHoneytoken,
    )
  }
  return false
}

export async function recordHoneytokenEvent(
  request: Request,
  input: { trapId: string; path: string; detail?: string },
) {
  try {
    const supabase = serviceClient()
    const clientIp = requestClientIp(request)
    const since = new Date(Date.now() - 60_000).toISOString()
    const { count } = await supabase
      .from('honeytoken_events')
      .select('id', { count: 'exact', head: true })
      .eq('client_ip', clientIp)
      .gte('created_at', since)

    if ((count ?? 0) >= 20) return

    const { error } = await supabase.from('honeytoken_events').insert({
      trap_id: input.trapId.slice(0, 80),
      path: input.path.slice(0, 300),
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 400),
      client_ip: clientIp,
      referrer: (request.headers.get('referer') ?? '').slice(0, 300),
      detail: (input.detail ?? '').slice(0, 500) || null,
    })
    if (error) {
      console.error('Unable to save honeytoken event:', error.message)
    }
  } catch (error) {
    console.error(
      'Unable to record honeytoken event:',
      error instanceof Error ? error.message : 'Unknown error',
    )
  }
}
