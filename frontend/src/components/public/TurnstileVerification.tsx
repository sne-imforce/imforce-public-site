import { Turnstile } from '@marsidev/react-turnstile'

type TurnstileVerificationProps = {
  action: 'contact' | 'job-order'
  onToken: (token: string) => void
  onError: (message: string) => void
}

export function TurnstileVerification({
  action,
  onToken,
  onError,
}: TurnstileVerificationProps) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim()

  if (!siteKey) {
    return (
      <p role="status">
        The secure form is temporarily unavailable. Please email{' '}
        <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>.
      </p>
    )
  }

  return (
    <Turnstile
      siteKey={siteKey}
      options={{ action, theme: 'light' }}
      onSuccess={onToken}
      onExpire={() => onToken('')}
      onError={(code) => {
        onToken('')
        onError(`Cloudflare Turnstile could not be completed (${code}). Please try again.`)
      }}
    />
  )
}
