import { env } from "@config/env.js";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Wrapper minimale sull'API HTTP di Resend (https://resend.com/docs/api-reference/emails/send-email).
// Nessuna libreria aggiuntiva: fetch è nativo in Node 20+. Se in futuro si volesse
// cambiare provider (SendGrid, Postmark, ...) basta sostituire questo file:
// notifications.service.ts non conosce i dettagli del provider concreto.
export async function sendEmailViaResend(input: SendEmailInput): Promise<void> {
  if (!env.EMAIL_PROVIDER_API_KEY) {
    throw new Error("EMAIL_PROVIDER_API_KEY is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_PROVIDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend API error (${response.status}): ${body}`);
  }
}
