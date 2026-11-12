'use strict'
/*
 * Sends one test email with the SMTP settings in backend/.env, and explains
 * any failure. Usage:  npm run email:test -- you@example.com
 */
require('dotenv').config()
const { createMailer } = require('../mailer')

const to = process.argv[2]
if (!to) { console.error('Usage: npm run email:test -- you@example.com'); process.exit(2) }
const host = (process.env.SMTP_HOST || '').trim()
if (!host || host === 'log') {
  console.error(`SMTP_HOST is ${host ? '"log"' : 'empty'}, so no email can be sent. In backend/.env set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM, then try again.`)
  process.exit(1)
}
const mailer = createMailer(process.env)
console.log(`Sending a test email to ${to} through ${host}:${process.env.SMTP_PORT || 587} as ${process.env.EMAIL_FROM}…`)
mailer.send({
  to,
  subject: 'IMFORCE test email',
  text: 'This is a test email from the IMFORCE website API. If you can read it, employer emails are working.',
  html: '<p>This is a test email from the IMFORCE website API. If you can read it, employer emails are working.</p>',
}).then(({ status }) => {
  if (status === 'sent') console.log('Sent. Check the inbox (and the spam folder) of', to)
  else console.error('Not sent. See the reason above.')
  process.exit(status === 'sent' ? 0 : 1)
})
