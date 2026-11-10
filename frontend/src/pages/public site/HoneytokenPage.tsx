import { useEffect, useMemo, type FormEvent } from 'react'
import {
  reportHoneytokenHit,
  STOLEN_SECRET_MARKER,
  type HoneytokenTrap,
} from '../../data/honeytokens'
import './HoneytokenPage.css'

type HoneytokenPageProps = {
  trap: HoneytokenTrap
}

function canaryUrl() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()?.replace(/\/$/, '')
  if (!supabaseUrl) {
    return `${window.location.origin}/internal-ops/verify`
  }
  return `${supabaseUrl}/functions/v1/honeytoken-hit?trap=stolen-env-secret`
}

function HoneytokenPage({ trap }: HoneytokenPageProps) {
  const secrets = useMemo(() => {
    const statusUrl = canaryUrl()
    return [
      'IMFORCE_ENV=production',
      `SUPABASE_SERVICE_ROLE_KEY=${STOLEN_SECRET_MARKER}`,
      'AWS_ACCESS_KEY_ID=AKIAHONEYFORCE0TRAP',
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/honeyTOKEN/trap',
      `STATUS_CHECK_URL=${statusUrl}`,
      'INTERNAL_ADMIN_USER=ops-backup',
      'INTERNAL_ADMIN_PASSWORD=ChangeMeAfterRotate!42',
    ].join('\n')
  }, [])

  useEffect(() => {
    document.title = trap.kind === 'login' ? 'Sign in' : 'Index of /internal'
    void reportHoneytokenHit(trap.trapId, trap.path)
  }, [trap.path, trap.trapId, trap.kind])

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const identity = String(
      formData.get('username') ?? formData.get('email') ?? '',
    ).trim()
    void reportHoneytokenHit('decoy-login', trap.path, identity.slice(0, 120))
    event.currentTarget.reset()
  }

  if (trap.kind === 'git') {
    return (
      <main className="honeytoken-page honeytoken-page--plain">
        <pre>{`[core]
	repositoryformatversion = 0
	filemode = false
[remote "origin"]
	url = https://github.com/imforce-internal/imforce-ops.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[user]
	email = ops-backup@imforce.internal
`}</pre>
      </main>
    )
  }

  if (trap.kind === 'secrets') {
    return (
      <main className="honeytoken-page honeytoken-page--plain">
        <pre>{secrets}</pre>
      </main>
    )
  }

  return (
    <main className="honeytoken-page honeytoken-page--login">
      <section className="honeytoken-login">
        <h1>Staff sign in</h1>
        <p>Use your internal operations account.</p>
        <form onSubmit={handleLogin}>
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Log in</button>
        </form>
      </section>
    </main>
  )
}

export default HoneytokenPage
