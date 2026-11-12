import type { StaffInquiry } from '../data/api'
import { enquiryReference } from './jobOrders'

// Internal or payment-plumbing fields that staff do not need to read.
const hiddenFields = new Set(['authorizedContact', 'paymentStatus', 'paymentAmountMinor', 'paymentCurrency', 'paystackTransactionId', 'resubmittedAt', 'lastChangeRequest', 'lastChangedFields', 'paymentReferences'])
// Only build a mailto: link from a plain, single address (no header injection).
const isSafeEmail = (value: string) => /^[^\s@<>"?&,;:]+@[^\s@<>"?&,;:]+\.[^\s@<>"?&,;:]+$/.test(value) && value.length <= 254

function humanizeField(key: string) {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Everything a contact enquiry or employer job order contains, plus a reply link. */
export default function EnquiryDetails({ inquiry }: { inquiry: StaffInquiry }) {
  const details = inquiry.details ?? {}
  const email = inquiry.kind === 'contact' ? inquiry.email ?? '' : String(details.email ?? '')
  return (
    <div className="admin-details">
      <dl className="staff-enquiry__details">
        {inquiry.kind === 'contact' ? (
          <>
            <div><dt>Reference</dt><dd>{enquiryReference(inquiry.id)}</dd></div>
            {inquiry.name && <div><dt>Name</dt><dd>{inquiry.name}</dd></div>}
            {inquiry.phone && <div><dt>Phone</dt><dd>{inquiry.phone}</dd></div>}
            {inquiry.enquiry_type && <div><dt>Enquiry type</dt><dd>{inquiry.enquiry_type}</dd></div>}
            <div className="staff-enquiry__wide"><dt>Message</dt><dd>{inquiry.message}</dd></div>
          </>
        ) : (
          Object.entries(details).filter(([key]) => !hiddenFields.has(key)).map(([key, value]) => (
            <div key={key} className={String(value).length > 80 ? 'staff-enquiry__wide' : undefined}>
              <dt>{humanizeField(key)}</dt><dd>{String(value)}</dd>
            </div>
          ))
        )}
      </dl>
      {isSafeEmail(email) && <a className="staff-enquiry__reply" href={`mailto:${email}`}>Reply by email</a>}
    </div>
  )
}
