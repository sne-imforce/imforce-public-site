import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'

export type JobOrder = {
  id: string
  legal_company_name: string
  trading_name: string | null
  registration_number: string
  vat_number: string | null
  company_address: string
  contact_name: string
  contact_email: string
  contact_phone: string
  billing_contact: string
  billing_address: string
  job_title: string
  job_location: string
  number_of_hires: number
  employment_type: string
  working_hours: string
  salary_type: string
  salary: string
  closing_date: string | null
  duties: string
  requirements: string
  qualifications: string
  attachment_path: string | null
  attachment_name: string | null
  status: string
  created_at: string
}

export async function createJobOrderAttachmentUrl(
  path: string,
  filename: string,
) {
  const { data, error } = await getSupabaseClient()
    .storage
    .from('job-order-files')
    .createSignedUrl(path, 60, { download: filename })

  if (error) {
    throw new Error(`Unable to open attachment: ${error.message}`)
  }
  return data.signedUrl
}

export function useJobOrders(enabled: boolean) {
  const [jobOrders, setJobOrders] = useState<JobOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setJobOrders([])
      const message = 'Supabase is not configured.'
      console.error(message)
      setError(message)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from('job_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (queryError) throw queryError
      setJobOrders((data ?? []) as JobOrder[])
    } catch (loadError) {
      console.error('Unable to load job orders.', loadError)
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load job orders.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active && enabled) return reload()
    })
    return () => {
      active = false
    }
  }, [enabled, reload])

  return { jobOrders, isLoading, error, reload }
}
