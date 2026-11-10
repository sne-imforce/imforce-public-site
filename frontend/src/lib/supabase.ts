import {
  createClient,
  FunctionsHttpError,
  type SupabaseClient,
} from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let client: SupabaseClient | null = null

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey)
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
    )
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey)
  }

  return client
}

export async function readFunctionErrorMessage(
  error: unknown,
  fallback: string,
) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload: unknown = await error.context.json()
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof payload.error === 'string' &&
        payload.error.trim()
      ) {
        return payload.error
      }
    } catch {
      // The function body is not JSON; use the fallback below.
    }
  }

  if (
    error instanceof Error &&
    error.message &&
    error.message !== 'Edge Function returned a non-2xx status code'
  ) {
    return error.message
  }

  return fallback
}
