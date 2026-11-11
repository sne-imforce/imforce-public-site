'use strict'
/*
 * Intrusion detection ("alarm system") for the IMFORCE API.
 *
 * Every suspicious action adds threat points to the source IP address. Honeypot
 * (trap) routes are an instant trip. When an IP crosses the threshold it is
 * blocked for a cooling-off period, a structured security event is logged,
 * optionally stored in Supabase (`security_events`), and an alert is POSTed to
 * the configured webhook (Slack / Microsoft Teams / generic JSON receiver).
 *
 * The state is process-local, like the rate limiter. Use a shared store and an
 * edge WAF before running more than one API instance.
 */
const net = require('node:net')

const SEVERITY_POINTS = { low: 10, medium: 25, high: 50, critical: 100 }
const BLOCK_THRESHOLD = 100
const SCORE_DECAY_MS = 60 * 60 * 1000
const DEFAULT_BLOCK_MS = 30 * 60 * 1000
const ALERT_THROTTLE_MS = 10 * 60 * 1000
const MAX_TRACKED = 20_000

// Paths that no legitimate visitor of this site will ever request. Scanners and
// attackers probe them first, so a hit is a reliable early warning.
const HONEYPOT_PATTERNS = [
  /^\/\.env(\.|$|\/)/i,
  /^\/\.git(\/|$)/i,
  /^\/\.aws(\/|$)/i,
  /^\/\.ssh(\/|$)/i,
  /^\/\.htaccess$/i,
  /^\/\.ds_store$/i,
  /^\/wp-(admin|login|content|includes|config)/i,
  /^\/xmlrpc\.php$/i,
  /^\/(php|pma|phpmyadmin|myadmin|adminer)/i,
  /\.(php|asp|aspx|jsp|cgi)$/i,
  /^\/(server-status|server-info)$/i,
  /^\/(actuator|console|manager\/html|solr|jenkins)(\/|$)/i,
  /^\/(backup|db|database|dump)\.(sql|zip|tar|gz)$/i,
  /^\/config\.(json|ya?ml)$/i,
  // Decoy API endpoints. /api/internal/backup is advertised only in robots.txt
  // as "Disallow", so only someone mining robots.txt for targets will find it.
  /^\/api\/(admin|debug|internal|backup|users|graphql|v\d+\/users|staff\/register|staff\/users)(\/|$)/i,
]

// Attack signatures in URLs and submitted text. Matching does not reject the
// request by itself (genuine text can occasionally look odd); it raises the
// alarm and adds threat points so repeat offenders get blocked.
const ATTACK_SIGNATURES = [
  { name: 'xss', pattern: /<\s*script\b|javascript\s*:\s*(alert|eval|fetch|document|window|void|prompt|confirm|\/\/|\()|\bon(error|load|mouseover|focus)\s*=|<\s*(iframe|svg|img)\b[^>]{0,200}\bon\w+\s*=/i },
  { name: 'sql-injection', pattern: /\bunion\b[\s\S]{0,20}\bselect\b|'\s*or\s*'?\d+'?\s*=\s*'?\d+|;\s*(drop|truncate|alter)\s+table\b|\b(pg_sleep|benchmark)\s*\(|\bsleep\s*\(\s*\d+\s*\)\s*(--|#|;)/i },
  { name: 'path-traversal', pattern: /(\.\.[/\\]){2,}|%2e%2e(%2f|%5c|\/)|\/etc\/passwd|c:\\windows\\/i },
  { name: 'template-injection', pattern: /\$\{\s*jndi:|\{\{\s*7\s*\*\s*7\s*\}\}|<%=|<\?php/i },
  { name: 'nosql-operator', pattern: /"\$(where|ne|gt|regex|function)"\s*:/i },
]

function isPrivateAddress(ip) {
  if (!ip) return true
  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip
  if (address === '::1' || address === '127.0.0.1') return true
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number)
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  return /^f[cd]/i.test(address) || /^fe80:/i.test(address)
}

// Removes control characters so attacker-supplied values cannot forge log lines.
function clean(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, max)
}

function collectStrings(value, out = [], depth = 0) {
  if (out.length > 200 || depth > 5) return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out, depth + 1))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) { out.push(key); collectStrings(item, out, depth + 1) }
  }
  return out
}

function detectAttack(req) {
  let url = req.originalUrl || ''
  try { url = decodeURIComponent(url) } catch { /* Malformed encoding is itself checked raw. */ }
  const haystacks = [url, req.originalUrl || '', ...collectStrings(req.body)]
  for (const text of haystacks) {
    const sample = text.slice(0, 6000)
    for (const signature of ATTACK_SIGNATURES) if (signature.pattern.test(sample)) return signature.name
  }
  return null
}

function createSecurityMonitor(options = {}) {
  const {
    alertWebhookUrl = '',
    persistEvent = null,
    blockMs = DEFAULT_BLOCK_MS,
    blockPrivateAddresses = false,
    allowlist = [],
    logger = (line) => console.warn(line),
    sendAlert = defaultSendAlert,
  } = options
  const scores = new Map()
  const blocked = new Map()
  const lastAlert = new Map()
  const allowed = new Set(allowlist.filter(Boolean))
  let persistedThisMinute = 0
  let persistWindow = Date.now()

  const canBlock = (ip) => !allowed.has(ip) && (blockPrivateAddresses || !isPrivateAddress(ip))

  function trim(map) {
    if (map.size < MAX_TRACKED) return
    const now = Date.now()
    for (const [key, value] of map) {
      if ((value.until ?? value.resetAt ?? 0) <= now) map.delete(key)
      if (map.size < MAX_TRACKED) return
    }
    map.delete(map.keys().next().value)
  }

  function isBlocked(ip) {
    const entry = blocked.get(ip)
    if (!entry) return false
    if (entry.until <= Date.now()) { blocked.delete(ip); return false }
    return true
  }

  function record(req, type, severity = 'medium', detail = '') {
    const ip = req.ip || 'unknown'
    const now = Date.now()
    const points = SEVERITY_POINTS[severity] ?? SEVERITY_POINTS.medium
    let score = scores.get(ip)
    if (!score || score.resetAt <= now) score = { points: 0, resetAt: now + SCORE_DECAY_MS }
    score.points += points
    trim(scores)
    scores.set(ip, score)

    let action = 'logged'
    if (score.points >= BLOCK_THRESHOLD) {
      if (canBlock(ip)) {
        trim(blocked)
        blocked.set(ip, { until: now + blockMs })
        action = 'blocked'
      } else action = 'alert-only'
    }

    const event = {
      at: new Date(now).toISOString(),
      type: clean(type, 60),
      severity,
      action,
      ip: clean(ip, 64),
      method: clean(req.method, 10),
      path: clean(req.originalUrl, 300),
      userAgent: clean(req.get?.('user-agent'), 200),
      detail: clean(detail, 300),
      threatScore: score.points,
    }
    logger(JSON.stringify({ level: 'security', ...event }))

    if (persistEvent) {
      if (now - persistWindow > 60_000) { persistWindow = now; persistedThisMinute = 0 }
      if (persistedThisMinute < 120) {
        persistedThisMinute += 1
        Promise.resolve().then(() => persistEvent(event)).catch(() => { /* Storage is best effort. */ })
      }
    }

    const shouldAlert = action === 'blocked' || severity === 'critical' || severity === 'high'
    const alertKey = `${ip}:${action === 'blocked' ? 'blocked' : type}`
    if (shouldAlert && alertWebhookUrl && (lastAlert.get(alertKey) ?? 0) + ALERT_THROTTLE_MS <= now) {
      lastAlert.set(alertKey, now)
      trim(lastAlert)
      Promise.resolve().then(() => sendAlert(alertWebhookUrl, event)).catch(() => { /* Alerts are best effort. */ })
    }
    return event
  }

  // Middleware: reject blocked IPs before any other work is done.
  function guard(req, res, next) {
    if (isBlocked(req.ip)) {
      res.set('Cache-Control', 'no-store')
      return res.status(403).json({ error: 'Access from your network has been temporarily restricted. Contact IMFORCE if you believe this is an error.' })
    }
    next()
  }

  // Middleware: honeypot routes and attack-signature inspection.
  function tripwire(req, res, next) {
    if (HONEYPOT_PATTERNS.some((pattern) => pattern.test(req.path))) {
      record(req, 'honeypot', 'critical', 'Trap route requested')
      // Look like an ordinary missing page so the attacker learns nothing.
      return res.status(404).json({ error: 'Not found.' })
    }
    const signature = detectAttack(req)
    if (signature) record(req, `attack-signature:${signature}`, 'medium', 'Suspicious content in request')
    next()
  }

  return { record, guard, tripwire, isBlocked, _state: { scores, blocked } }
}

async function defaultSendAlert(url, event) {
  const text = `:rotating_light: IMFORCE API security alert — ${event.type} (${event.severity}, ${event.action}) from ${event.ip} on ${event.method} ${event.path} at ${event.at}. Threat score ${event.threatScore}.`
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, event }),
    signal: AbortSignal.timeout(5_000),
  })
}

module.exports = { createSecurityMonitor, detectAttack, isPrivateAddress, HONEYPOT_PATTERNS, BLOCK_THRESHOLD }
