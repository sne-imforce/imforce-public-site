import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'

export const STOLEN_SECRET_MARKER = 'imf_ht_live_8c2e91b4d7a64f0ab31e55c9'

export type HoneytokenKind = 'login' | 'secrets' | 'git'

export type HoneytokenTrap = {
  path: string
  trapId: string
  kind: HoneytokenKind
}

export type HoneytokenEvent = {
  id: string
  trap_id: string
  path: string
  user_agent: string | null
  client_ip: string | null
  referrer: string | null
  detail: string | null
  created_at: string
}

export const honeytokenTraps: HoneytokenTrap[] = [
  { path: '/.env', trapId: 'env-file', kind: 'secrets' },
  { path: '/.git/config', trapId: 'git-config', kind: 'git' },
  { path: '/wp-admin', trapId: 'wp-admin', kind: 'login' },
  { path: '/wp-login.php', trapId: 'wp-login', kind: 'login' },
  { path: '/phpmyadmin', trapId: 'phpmyadmin', kind: 'login' },
  { path: '/administrator', trapId: 'administrator', kind: 'login' },
  { path: '/dashboard', trapId: 'dashboard', kind: 'login' },
  { path: '/staff', trapId: 'staff', kind: 'login' },
  { path: '/admin/login', trapId: 'admin-login', kind: 'login' },
  { path: '/backup.sql', trapId: 'backup-sql', kind: 'secrets' },
  { path: '/config.yml', trapId: 'config-yml', kind: 'secrets' },
  { path: '/internal-ops/secrets.env', trapId: 'internal-secrets', kind: 'secrets' },
  { path: '/internal-ops/verify', trapId: 'canary-verify', kind: 'secrets' },
]

const trapsByPath = new Map(
  honeytokenTraps.map((trap) => [trap.path, trap]),
)

export function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function matchHoneytokenPath(pathname: string) {
  return trapsByPath.get(normalizePath(pathname)) ?? null
}

export async function reportHoneytokenHit(
  trapId: string,
  path: string,
  detail?: string,
) {
  if (!isSupabaseConfigured()) return

  try {
    await getSupabaseClient().functions.invoke('honeytoken-hit', {
      body: { trapId, path, detail },
    })
  } catch {
    // Trap telemetry must never affect the page the visitor sees.
  }
}

export function useHoneytokenEvents(enabled: boolean) {
  const [events, setEvents] = useState<HoneytokenEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!enabled) {
      setEvents([])
      setError('')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const { data, error: loadError } = await getSupabaseClient()
        .from('honeytoken_events')
        .select(
          'id, trap_id, path, user_agent, client_ip, referrer, detail, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(50)

      if (loadError) {
        throw new Error(`Unable to load trap alerts: ${loadError.message}`)
      }

      setEvents(data ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load trap alerts.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) return reload()
    })
    return () => {
      active = false
    }
  }, [reload])

  return { events, isLoading, error, reload }
}
