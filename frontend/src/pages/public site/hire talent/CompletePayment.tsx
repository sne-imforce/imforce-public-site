import { useEffect, useState } from 'react'
import { FiAlertCircle, FiCheck, FiLock, FiPhone } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import Navbar from '../../../components/public/Navbar'
import Spinner, { LoadingBlock } from '../../../components/ui/Spinner'
import { openPaymentLink, resumePaystackCheckout, type ApiError, type PaymentLinkSummary } from '../../../data/api'
import { formatDateDmy } from '../../../utils/dates'
import './Employers.css'
import './UpdateJobOrder.css'

type State =
  | { phase: 'loading' }
  | { phase: 'invalid'; message: string }
  | { phase: 'ready'; order: PaymentLinkSummary }
  | { phase: 'paid'; reference: string }

// Read the private token once, then remove it from the address bar so it is not
// left in browser history, screenshots or a shared screen.
function takeTokenFromUrl() {
  const match = window.location.hash.match(/token=([A-Za-z0-9_-]{43})/)
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  return match?.[1] ?? ''
}

/** /employers/complete-payment#token=…: pay for a job order that IMFORCE already has (link from our email). */
export default function CompletePayment() {
  const [token] = useState(takeTokenFromUrl)
  const [state, setState] = useState<State>(token ? { phase: 'loading' } : { phase: 'invalid', message: 'This page needs the private payment link from your IMFORCE email.' })
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    openPaymentLink(token).then(
      (order) => {
        if (!active) return
        if (order.paid) setState({ phase: 'paid', reference: order.reference })
        else if (order.closed) setState({ phase: 'invalid', message: `Job order ${order.reference} is closed. Contact IMFORCE before paying.` })
        else setState({ phase: 'ready', order })
      },
      (cause: unknown) => { if (active) setState({ phase: 'invalid', message: cause instanceof Error ? cause.message : 'This link could not be opened.' }) },
    )
    return () => { active = false }
  }, [token])

  const pay = async () => {
    if (state.phase !== 'ready' || starting) return
    setStarting(true); setError('')
    try {
      const { authorizationUrl } = await resumePaystackCheckout(token)
      const checkoutUrl = new URL(authorizationUrl)
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') {
        throw new Error('Paystack returned an invalid checkout address. Please contact IMFORCE.')
      }
      // Paystack returns to /employers, which confirms the payment.
      window.location.assign(checkoutUrl.toString())
    } catch (cause) {
      if ((cause as ApiError).payload?.alreadyPaid) { setState({ phase: 'paid', reference: state.order.reference }); return }
      setError(cause instanceof Error ? cause.message : 'Paystack checkout could not be started. Please try again.')
      setStarting(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className="employers-page update-order">
        <section className="employers-hero" aria-labelledby="payment-title">
          <div className="employers-shell employers-hero__inner">
            <p className="employers-eyebrow">For employers</p>
            <h1 id="payment-title">Complete your payment</h1>
            <p className="employers-hero__intro">Pay the activation fee for the job order you already sent us. Our team reviews your advert within 1 business day of payment.</p>
          </div>
        </section>

        <section className="employers-request employers-shell" aria-live="polite">
          {state.phase === 'loading' && <LoadingBlock label="Opening your job order…" />}

          {state.phase === 'invalid' && (
            <div className="update-order__message update-order__message--warning" role="alert">
              <FiAlertCircle aria-hidden="true" />
              <div>
                <h2>This link can’t be used</h2>
                <p>{state.message}</p>
                <p>Payment links expire after 7 days. Reply to the IMFORCE email or call <a href="tel:0334920600">033 492 0600</a> and we’ll send you a new one.</p>
                <Link className="employers-button employers-button--primary" to="/contact">Contact IMFORCE</Link>
              </div>
            </div>
          )}

          {state.phase === 'paid' && (
            <div className="update-order__message update-order__message--success" role="status">
              <span className="update-order__tick" aria-hidden="true"><FiCheck /></span>
              <div>
                <h2>This job order is already paid.</h2>
                <p>Job order {state.reference} is with our team. There is nothing more to pay. We’ll email you once your advert is live, or if anything needs to change.</p>
                <p className="update-order__phone"><FiPhone aria-hidden="true" /> <span>Questions? Call <a href="tel:0334920600">033 492 0600</a>.</span></p>
              </div>
            </div>
          )}

          {state.phase === 'ready' && (
            <div className="update-order__request update-order__pay">
              <h2>{state.order.jobTitle || 'Your job order'}</h2>
              <p>{state.order.company} · Job order {state.order.reference}</p>
              <p className="update-order__amount">Activation fee: <strong>{state.order.amount}</strong></p>
              {error && <p className="update-order__field-error" role="alert">{error}</p>}
              <button className="employers-button employers-button--primary" type="button" onClick={() => { void pay() }} disabled={starting} aria-busy={starting}>
                {starting ? <Spinner label="Opening Paystack…" size="sm" tone="light" /> : `Pay ${state.order.amount} securely`}
              </button>
              <p><FiLock aria-hidden="true" /> Payment is processed by Paystack. IMFORCE never sees your card details. This private link expires on {formatDateDmy(state.order.expiresAt)}; do not forward it.</p>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
