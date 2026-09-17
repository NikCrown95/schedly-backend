export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function wrapHtml(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Arial, sans-serif; color: #1a1a1a; line-height: 1.5;">
    ${bodyHtml}
    <p style="margin-top: 32px; font-size: 12px; color: #888;">Schedly</p>
  </body>
</html>`;
}

// Ogni evento noto ha un template dedicato. Un eventType non mappato ricade su un
// template generico (utile per non bloccare mai l'invio anche se un modulo futuro
// dimentica di registrare un template specifico).
export function renderEmailTemplate(
  eventType: string,
  payload: Record<string, unknown> = {}
): RenderedEmail {
  switch (eventType) {
    case "auth.verify_email": {
      const verifyUrl = `${payload.appUrl}/verify-email?token=${payload.verifyToken}`;
      return {
        subject: "Verify your email — Schedly",
        html: wrapHtml(
          `<p>Welcome to Schedly!</p><p>Please confirm your email address:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
        ),
        text: `Welcome to Schedly! Confirm your email: ${verifyUrl}`,
      };
    }

    case "auth.password_reset": {
      const resetUrl = `${payload.appUrl}/reset-password?token=${payload.resetToken}`;
      return {
        subject: "Reset your password — Schedly",
        html: wrapHtml(
          `<p>We received a request to reset your password.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`
        ),
        text: `Reset your password: ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
      };
    }

    case "appointment.created": {
      const { businessName, serviceName, formattedStart, customerName } = payload as Record<
        string,
        string | undefined
      >;
      return {
        subject: `Appointment confirmed${businessName ? ` — ${businessName}` : ""}`,
        html: wrapHtml(
          `<p>Hi ${customerName ?? "there"},</p><p>Your appointment${serviceName ? ` for <strong>${serviceName}</strong>` : ""} is confirmed${formattedStart ? ` for <strong>${formattedStart}</strong>` : ""}.</p>`
        ),
        text: `Hi ${customerName ?? "there"}, your appointment${serviceName ? ` for ${serviceName}` : ""} is confirmed${formattedStart ? ` for ${formattedStart}` : ""}.`,
      };
    }

    case "appointment.cancelled": {
      const { businessName, serviceName, formattedStart, customerName } = payload as Record<
        string,
        string | undefined
      >;
      return {
        subject: `Appointment cancelled${businessName ? ` — ${businessName}` : ""}`,
        html: wrapHtml(
          `<p>Hi ${customerName ?? "there"},</p><p>Your appointment${serviceName ? ` for <strong>${serviceName}</strong>` : ""}${formattedStart ? ` on <strong>${formattedStart}</strong>` : ""} has been cancelled.</p>`
        ),
        text: `Hi ${customerName ?? "there"}, your appointment${serviceName ? ` for ${serviceName}` : ""}${formattedStart ? ` on ${formattedStart}` : ""} has been cancelled.`,
      };
    }

    default: {
      return {
        subject: `Schedly notification: ${eventType}`,
        html: wrapHtml(`<p>Event: ${eventType}</p><pre>${JSON.stringify(payload, null, 2)}</pre>`),
        text: `Event: ${eventType}\n${JSON.stringify(payload)}`,
      };
    }
  }
}
