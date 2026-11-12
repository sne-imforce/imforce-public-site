import { useOutletContext } from 'react-router-dom'
import type { StaffInquiry } from '../data/api'

export type AdminContext = {
  /** The signed-in agent's name (falls back to their email for older accounts). */
  staffName: string
  inquiries: StaffInquiry[]
  inquiriesError: string
  reloadInquiries: () => Promise<void>
  /** Shows a short confirmation message at the bottom of the screen. */
  notify: (message: string) => void
}

export const useAdmin = () => useOutletContext<AdminContext>()
