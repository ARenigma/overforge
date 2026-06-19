// Email sender implementation via Resend HTTP API.
// If RESEND_API_KEY is absent, returns a no-op sender so dev/offline works.

import { EmailSender, EmailMessage } from './outbox';

const RESEND_API = 'https://api.resend.com/emails';

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
      console.log(`[email no-op] to=${msg.to} subject="${msg.subject}"`);
    },
  };
}

/** Returns the appropriate EmailSender based on environment configuration. */
export function createEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? 'noreply@overforge.io';

  if (!apiKey) {
    return makeNoOpSender();
  }

  return makeResendSender(apiKey, from);
}
