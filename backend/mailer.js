'use strict'
/*
 * Outgoing email (SMTP) for employer notifications.
 *
 * SMTP_HOST unset  -> email is "not configured"; callers fall back to letting
 *                     staff copy the link and send it themselves.
 * SMTP_HOST=log    -> development only: emails are written to the API log
 *                     instead of being sent (refused in production).
 * SMTP_HOST=<host> -> sent through that SMTP server (TLS 1.2+ required).
 *
 * Never throws: returns { status: 'sent' | 'failed' | 'not_configured' }.
 */
const nodemailer = require('nodemailer')

// One plain address only: no display names, lists, comments or line breaks
// (stops header injection and recipient smuggling).
const singleAddress = /^[^\s@,;:<>"()[\]\\]{1,64}@[^\s@,;:<>"()[\]\\]{1,190}$/
const oneLine = (value, max) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max)

function createMailer(env, { logger = (line) => console.log(line) } = {}) {
  const host = (env.SMTP_HOST || '').trim()
  const from = oneLine(env.EMAIL_FROM, 200)
  const replyTo = oneLine(env.EMAIL_REPLY_TO, 200) || undefined
  const outbox = [] // last messages in log mode (development and tests)

  if (!host) return { configured: false, mode: 'off', outbox, send: async () => ({ status: 'not_configured' }) }
  if (host === 'log' && env.NODE_ENV === 'production') throw new Error('SMTP_HOST=log is for development only.')
  if (host !== 'log' && !from) throw new Error('Set EMAIL_FROM (e.g. "IMFORCE <admin@imforce.co.za>") when SMTP_HOST is set.')

  const port = Number(env.SMTP_PORT || 587)
  const transport = host === 'log'
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    })

  return {
    configured: true,
    mode: host === 'log' ? 'log' : 'smtp',
    outbox,
    async send({ to, subject, text, html }) {
      if (typeof to !== 'string' || !singleAddress.test(to.trim())) return { status: 'failed' }
      const message = {
        from: from || 'IMFORCE <no-reply@localhost>',
        replyTo,
        to: to.trim(),
        subject: oneLine(subject, 150),
        text,
        html,
        disableFileAccess: true,
        disableUrlAccess: true,
      }
      try {
        await transport.sendMail(message)
        if (host === 'log') {
          outbox.push(message)
          if (outbox.length > 50) outbox.shift()
          logger(`[email:dev] To: ${message.to} | Subject: ${message.subject}\n${text}`)
        }
        return { status: 'sent' }
      } catch {
        return { status: 'failed' }
      }
    },
  }
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

module.exports = { createMailer, escapeHtml }
