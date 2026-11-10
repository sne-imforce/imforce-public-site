import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient } from '../lib/supabase'

export type ContactEnquiry = {
  id: string
  name: string
  email: string
  phone: string | null
  enquiry_type: string
  subject: string
  message: string
  created_at: string
}

export function useContactEnquiries(enabled: boolean) {
  const [enquiries, setEnquiries] = useState<ContactEnquiry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!enabled) {
      setEnquiries([])
      setError('')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const { data, error: loadError } = await getSupabaseClient()
        .from('contact_enquiries')
        .select('id, name, email, phone, enquiry_type, subject, message, created_at')
        .order('created_at', { ascending: false })
        .limit(50)

      if (loadError) {
        throw new Error(`Unable to load contact enquiries: ${loadError.message}`)
      }

      setEnquiries(data ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load contact enquiries.',
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

  return { enquiries, isLoading, error, reload }
}
