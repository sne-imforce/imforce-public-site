'use strict'
// The mailer must never claim an email reached the employer when it did not.
const test = require('node:test')
const assert = require('node:assert/strict')
const { createMailer, describeSmtpError } = require('../mailer')

const message = { to: 'hr@acme.co.za', subject: 'Hello', text: 'Body', html: '<p>Body</p>' }

test('SMTP_HOST=log prints the email but reports it as NOT sent outside tests', async () => {
  const lines = []
  const mailer = createMailer({ SMTP_HOST: 'log', NODE_ENV: 'development' }, { logger: (line) => lines.push(line) })
  assert.equal((await mailer.send(message)).status, 'not_configured')
  assert.match(lines[0], /NOT SENT/)
})

test('no SMTP_HOST: not configured; bad recipient: failed; log mode refused in production', async () => {
  assert.equal((await createMailer({}).send(message)).status, 'not_configured')
  assert.equal((await createMailer({ SMTP_HOST: 'log', NODE_ENV: 'development' }, { logger: () => {} }).send({ ...message, to: 'a@b.co, c@d.co' })).status, 'failed')
  assert.throws(() => createMailer({ SMTP_HOST: 'log', NODE_ENV: 'production' }), /development only/)
})

test('SMTP failures are explained without leaking credentials', () => {
  assert.match(describeSmtpError({ code: 'EAUTH', response: '535 Authentication failed' }), /EAUTH: 535 .*app password/)
  assert.match(describeSmtpError({ code: 'ETIMEDOUT' }), /SMTP_HOST and SMTP_PORT/)
})
