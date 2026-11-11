import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Injects a strict Content-Security-Policy into the production HTML. It is not
// applied in development because Vite's dev server relies on inline scripts.
// Headers that cannot be set in a <meta> tag (frame-ancestors, HSTS) live in
// public/_headers and must also be configured on whichever host serves the site.
function contentSecurityPolicy(apiBaseUrl: string): Plugin {
  let apiOrigin = ''
  if (apiBaseUrl) {
    const parsed = new URL(apiBaseUrl)
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      throw new Error('VITE_API_BASE_URL must use HTTPS for production builds.')
    }
    apiOrigin = parsed.origin
  }
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')
  return {
    name: 'imforce-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
      { tag: 'meta', attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' }, injectTo: 'head' },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_BASE_URL ?? '')],
    build: { sourcemap: false },
  }
})
