import type { ReactNode } from 'react'

type ActionLinkProps = {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'text'
}

function ActionLink({
  href,
  children,
  variant = 'primary',
}: ActionLinkProps) {
  return (
    <a className={`action-link action-link-${variant}`} href={href}>
      {children}
    </a>
  )
}

export default ActionLink
