import nodemailer from 'nodemailer'

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function emailError(message, retryable = false) {
  return Object.assign(new Error(message), { retryable })
}

export function getClassEmailConfig(env = process.env) {
  const smtpHost = env.CLASS_REQUEST_SMTP_HOST || env.SMTP_HOST || ''
  const smtpPort = Number(env.CLASS_REQUEST_SMTP_PORT || env.SMTP_PORT || 587)
  const from = env.CLASS_REQUEST_EMAIL_FROM || env.SMTP_ADMIN_EMAIL || ''
  const ownerEmail = env.CLASS_REQUEST_OWNER_EMAIL || env.VITE_OWNER_EMAIL || ''
  const appUrl = env.CLASS_REQUEST_APP_URL || env.VITE_AUTH_REDIRECT_BASE_URL || ''
  let validAppUrl = false
  try {
    const parsed = new URL(appUrl)
    validAppUrl = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))
  } catch { /* Unconfigured environments keep notifications queued. */ }
  return {
    enabled: env.CLASS_REQUEST_EMAIL_ENABLED === 'true',
    ready: Boolean(from && ownerEmail && validAppUrl && (smtpHost || env.RESEND_API_KEY)),
    from, ownerEmail, appUrl,
    testRecipient: env.CLASS_REQUEST_EMAIL_TEST_RECIPIENT || '',
    resendApiKey: env.RESEND_API_KEY || '',
    smtp: smtpHost ? {
      host: smtpHost,
      port: smtpPort,
      secure: (env.CLASS_REQUEST_SMTP_SECURE || env.SMTP_SECURE || String(smtpPort === 465)) === 'true',
      requireTLS: (env.CLASS_REQUEST_SMTP_REQUIRE_TLS || 'true') === 'true',
      auth: (env.CLASS_REQUEST_SMTP_USER || env.SMTP_USER) ? {
        user: env.CLASS_REQUEST_SMTP_USER || env.SMTP_USER,
        pass: env.CLASS_REQUEST_SMTP_PASSWORD || env.SMTP_PASS || env.SMTP_PASSWORD || '',
      } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    } : null,
  }
}

export function buildClassRequestEmail(event, config) {
  const request = event.payload
  const isReview = event.event_type === 'owner_review'
  const isApproved = event.event_type === 'request_approved'
  const actionUrl = new URL(isReview ? '/owner/classes' : '/signin', config.appUrl)
  if (isReview) actionUrl.searchParams.set('request', event.request_id)
  const departments = Array.isArray(request.departments) ? request.departments.join(', ') : ''
  const title = isReview ? 'A new class is ready for your review' : isApproved ? 'Your class is approved' : 'An update on your class request'
  const intro = isReview
    ? `${request.requester_name || 'A cadet'} requested ${request.class_name}. Review the details and approve the request from your owner account.`
    : isApproved
      ? `${request.class_name} is ready. You are the class administrator. Sign in with the account you used to request your class and finish your profile.`
      : `Your request for ${request.class_name} was not approved.${request.decision_note ? ` ${request.decision_note}` : ' Sign in to review your request or submit updated class details.'}`
  const details = [
    ['Academy', request.academy_name], ['Class', request.class_name],
    ['Location', [request.academy_city, request.academy_state].filter(Boolean).join(', ')],
    ['Start date', request.start_date || 'Not provided'], ['Graduation date', request.end_date || 'Not provided'],
    ['Departments', departments || 'Not provided'],
    ...(isReview ? [['Requester', `${request.requester_name || ''} (${request.requester_email})`], ['Requester department', request.requester_department], ['Notes', request.requester_note || 'None']] : []),
  ]
  const actionLabel = isReview ? 'Review class request' : 'Sign in to 180 Academy'
  const to = config.testRecipient || (isReview ? config.ownerEmail : request.requester_email)
  if (!to || /[\r\n]/.test(to)) throw emailError('A valid notification recipient is required')
  return {
    from: config.from,
    to: [to],
    subject: `${isReview ? 'Class approval requested' : isApproved ? 'Class approved' : 'Class request update'}: ${String(request.class_name).replace(/[\r\n]/g, ' ')}`,
    text: `${title}\n\n${intro}\n\n${details.map(([label, value]) => `${label}: ${value || ''}`).join('\n')}\n\n${actionLabel}: ${actionUrl.href}\n\nRequest reference: ${event.request_id}`,
    html: `<div style="background:#f3f5f9;padding:32px 16px;font-family:Arial,sans-serif;color:#18243b"><div style="max-width:580px;margin:auto;background:#fff;border:1px solid #e0e6ef;border-radius:18px;padding:32px"><p style="font-size:12px;letter-spacing:2px;color:#536888">180 ACADEMY</p><h1 style="font-size:26px;line-height:1.25">${escapeHtml(title)}</h1><p style="line-height:1.65;color:#47566e">${escapeHtml(intro)}</p><table style="width:100%;border-collapse:collapse;font-size:14px">${details.map(([label, value]) => `<tr><td style="padding:10px 8px 10px 0;border-bottom:1px solid #edf0f5;color:#637189;vertical-align:top">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #edf0f5;line-height:1.5">${escapeHtml(value)}</td></tr>`).join('')}</table><p style="margin:28px 0"><a href="${escapeHtml(actionUrl.href)}" style="display:inline-block;background:#3159ed;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:bold">${actionLabel}</a></p><p style="font-size:12px;color:#748198">Request reference: ${escapeHtml(event.request_id)}</p></div></div>`,
  }
}

export function createClassEmailTransport(config, { fetchImpl = fetch, createTransport = nodemailer.createTransport } = {}) {
  const smtp = config.smtp ? createTransport(config.smtp) : null
  return async (event, message) => {
    if (smtp) {
      try {
        const result = await smtp.sendMail({ ...message, messageId: `<class-request-${event.id}@${new URL(config.appUrl).hostname}>` })
        if (!result.accepted?.length) throw emailError('SMTP did not accept the notification recipient')
        return result.messageId
      } catch (error) {
        // Once DATA may have been sent a network error is ambiguous. Require
        // review instead of risking duplicate mail. Explicit 4xx rejections or
        // connection/auth failures are safe to retry with the same event.
        const definiteRejection = Number(error.responseCode) >= 400 && Number(error.responseCode) < 500
        const beforeMessage = ['CONN', 'EHLO', 'HELO', 'STARTTLS', 'AUTH', 'MAIL FROM', 'RCPT TO'].includes(error.command)
        throw emailError(`SMTP notification failed (${error.code || error.responseCode || 'delivery uncertain'}).`, definiteRejection || beforeMessage)
      }
    }
    let response
    try {
      response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json', 'idempotency-key': `class-request/${event.id}` },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      // Resend retains the idempotency key for 24h. Retries are limited to eight
      // attempts and 23h from the first attempt so an uncertain send stays safe.
      throw emailError('Email provider connection failed.', true)
    }
    if (!response.ok) throw emailError(`Email provider rejected notification (${response.status}).`, response.status === 429 || response.status >= 500)
    const result = await response.json()
    if (!result.id) throw emailError('Email provider returned an uncertain delivery result.')
    return result.id
  }
}

export function createClassRequestEmailService({ supabase, env = process.env, sendEmail, logger = console, now = () => new Date() }) {
  const config = getClassEmailConfig(env)
  const deliver = sendEmail || createClassEmailTransport(config)
  let running = false
  async function drain() {
    if (!config.enabled || !config.ready || running) return { processed: 0, enabled: config.enabled, ready: config.ready }
    running = true
    let processed = 0
    try {
      const { data: events, error } = await supabase.rpc('claim_class_request_emails', { p_limit: 5 })
      if (error) throw error
      for (const event of events || []) {
        let outcome = 'sent'
        let providerId = null
        let failure = null
        try {
          if (!config.smtp && now().getTime() - Date.parse(event.first_attempt_at) > 23 * 60 * 60 * 1000) {
            throw emailError('Idempotency window expired. Verify provider delivery before retrying.')
          }
          providerId = await deliver(event, buildClassRequestEmail(event, config))
        } catch (error) {
          outcome = error.retryable ? 'retry' : 'needs_review'
          failure = String(error.message || 'Notification failed').slice(0, 500)
        }
        const { data: completed, error: completeError } = await supabase.rpc('finish_class_request_email', {
          p_id: event.id, p_lock_token: event.lock_token, p_outcome: outcome,
          p_provider_message_id: providerId, p_error: failure,
        })
        if (completeError || !completed) {
          logger.error('Class email delivery receipt could not be saved; expired lease will require review.', { eventId: event.id })
        } else if (outcome !== 'sent') {
          logger.warn('Class email notification needs attention.', { eventId: event.id, outcome })
        }
        processed += 1
      }
    } finally { running = false }
    return { processed, enabled: true, ready: true }
  }
  function start() {
    if (!config.enabled || !config.ready) {
      logger.info('Class email notifications remain queued until delivery is enabled and configured.')
      return () => {}
    }
    const run = () => drain().catch(() => logger.error('Class email queue could not be processed. Check database migration and connectivity.'))
    const timer = setInterval(run, 30_000)
    timer.unref()
    void run()
    return () => clearInterval(timer)
  }
  return { drain, start, config }
}
