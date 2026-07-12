// Email sender implementation via Resend HTTP API.
// If RESEND_API_KEY or RESEND_FROM is absent, returns a no-op sender so dev/offline works.

import { EmailSender, EmailMessage } from './outbox';

const RESEND_API = 'https://api.resend.com/emails';

const _DISABLED_MSG =
  '[email] DISABLED — RESEND_API_KEY/RESEND_FROM unset; candidate result emails are NOT being sent';

// Warn once at module load-time so misconfigured deployments surface on startup.
if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
  console.error(_DISABLED_MSG);
}

function makeResendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(msg: EmailMessage): Promise<void> {
      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from,
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
    },
  };
}

function makeNoOpSender(): EmailSender {
  return {
    async send(msg: EmailMessage): Promise<void> {
      console.error(_DISABLED_MSG);
      console.error(`[email no-op] to=${msg.to} subject="${msg.subject}" (not sent)`);
    },
  };
}

/** Returns the appropriate EmailSender based on environment configuration. */
export function createEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    return makeNoOpSender();
  }

  return makeResendSender(apiKey, from);
}
