import { FiSettings } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import './StaffAccessModal.css'

/** Small gear link in the footer that opens the staff workspace (/admin). */
function StaffAccessModal() {
  return (
    <Link className="staff-access-trigger" to="/admin" aria-label="Open admin portal" title="Admin portal">
      <FiSettings aria-hidden="true" />
    </Link>
  )
}

export default StaffAccessModal
