import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { saveStaffToken, staffLogin, verifyStaffMfa, type StaffMfaStep, type StaffSession } from '../data/api'

type Props = {
  notice: string
  onSignedIn: (session: StaffSession) => Promise<void>
}

/** Two-step staff sign-in: password, then authenticator code (with first-time setup). */
export default function AdminLogin({ notice, onSignedIn }: Props) {
  const [error, setError] = useState(notice)
  const [busy, setBusy] = useState(false)
  const [mfaStep, setMfaStep] = useState<StaffMfaStep | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (mfaStep) codeRef.current?.focus() }, [mfaStep])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    setBusy(true)
    setError('')
    try {
      const result = await staffLogin(email, password)
      if (result.mfa) setMfaStep(result.mfa)
      else await onSignedIn(result)
    } catch (cause) {
      saveStaffToken(null)
      setError(cause instanceof Error ? cause.message : 'Sign in could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const handleMfa = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!mfaStep || busy) return
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '')
    setBusy(true)
    setError('')
    try {
      await onSignedIn(await verifyStaffMfa(mfaStep.ticket, mfaStep.factorId, code))
    } catch (cause) {
      saveStaffToken(null)
      setError(cause instanceof Error ? cause.message : 'The code could not be checked.')
      // Only an expired sign-in ticket sends the user back to the password step.
      if (cause instanceof Error && /Start again/.test(cause.message)) setMfaStep(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="staff-access-panel staff-access-panel--page staff-access-panel--login">
      <div className="staff-access-page__topbar">
        <div>
          <p className="staff-access-eyebrow">IMFORCE team</p>
          <h1>Admin Login</h1>
        </div>
        <Link className="staff-access-home" to="/">HOME</Link>
      </div>

      {mfaStep ? (
        // Separate keys stop React reusing the password input for the code field.
        <form key="mfa-step" className="staff-access-form" onSubmit={handleMfa}>
          {mfaStep.step === 'enroll' ? (
            <div className="staff-mfa__setup">
              <h2>Set up two-step sign-in</h2>
              <ol>
                <li>Open an authenticator app on your phone (for example Microsoft Authenticator or Google Authenticator).</li>
                <li>Scan this QR code, or type the setup key into the app.</li>
                <li>Enter the 6-digit code the app shows.</li>
              </ol>
              {mfaStep.qrCode && <img className="staff-mfa__qr" src={mfaStep.qrCode} alt="QR code for your authenticator app" width={180} height={180} />}
              {mfaStep.secret && <p className="staff-mfa__secret">Setup key: <code>{mfaStep.secret}</code></p>}
            </div>
          ) : (
            <p className="staff-access-description">Enter the 6-digit code from your authenticator app.</p>
          )}
          <label>
            Authentication code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required ref={codeRef} />
          </label>
          {error && <p className="staff-access-error" role="alert">{error}</p>}
          <button className="staff-access-submit" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
          <button className="staff-mfa__back" type="button" onClick={() => { setMfaStep(null); setError('') }}>
            Use a different account
          </button>
        </form>
      ) : (
        <form key="password-step" className="staff-access-form" onSubmit={handleLogin}>
          <label>
            Company email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <p className="staff-access-error" role="alert">{error}</p>}
          <button className="staff-access-submit" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? 'Signing in…' : 'Continue to recruiter dashboard'}
          </button>
          <p className="staff-access-description">
            For authorised IMFORCE staff only. Sign-in attempts are monitored and logged.
          </p>
        </form>
      )}
    </section>
  )
}
