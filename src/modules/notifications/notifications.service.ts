import { prisma } from "@shared/lib/prisma.js";
import { logger } from "@shared/lib/logger.js";
import { env } from "@config/env.js";
import type { NotificationChannel } from "@prisma/client";
import { sendEmailViaResend } from "./providers/resend.provider.js";
import { renderEmailTemplate } from "./email-templates.js";

export interface SendNotificationInput {
  businessId: string | null;
  channel: NotificationChannel;
  eventType: string; // es. "auth.verify_email", "appointment.created", ...
  recipient: string;
  payload?: Record<string, unknown>;
}

// Punto di ingresso UNICO per inviare notifiche da qualsiasi modulo. I chiamanti
// non conoscono il provider concreto né il template: passano solo eventType +
// payload strutturato. Aggiungere SMS/WhatsApp/push in futuro significa estendere
// lo switch qui sotto, senza toccare auth/appointments/altri moduli chiamanti.
export async function sendNotification(input: SendNotificationInput): Promise<void> {
  const log = await prisma.notificationLog.create({
    data: {
      businessId: input.businessId ?? undefined,
      channel: input.channel,
      eventType: input.eventType,
      recipient: input.recipient,
      status: "PENDING",
    },
  });

  try {
    switch (input.channel) {
      case "EMAIL":
        await deliverEmail(input);
        break;
      case "SMS":
      case "WHATSAPP":
      case "PUSH":
        // Predisposto architetturalmente (sezione 13) ma non ancora implementato:
        // nessun provider SMS/WhatsApp/push collegato in questa fase.
        logger.info(
          { channel: input.channel, eventType: input.eventType },
          "[notification stub] channel not yet implemented — logging only"
        );
        break;
    }

    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: "SENT" } });
  } catch (err) {
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "unknown error" },
    });
    // Non rilanciamo l'errore: un fallimento di notifica non deve mai bloccare
    // il flusso applicativo principale (es. la creazione di un appuntamento).
  }
}

async function deliverEmail(input: SendNotificationInput): Promise<void> {
  const rendered = renderEmailTemplate(input.eventType, input.payload);

  // Se non è configurata una API key (es. sviluppo locale senza provider reale),
  // degradiamo a semplice log invece di far fallire la richiesta principale.
  if (!env.EMAIL_PROVIDER_API_KEY) {
    logger.info(
      { to: input.recipient, subject: rendered.subject },
      "[email stub] EMAIL_PROVIDER_API_KEY not set — would send this email"
    );
    return;
  }

  await sendEmailViaResend({
    to: input.recipient,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
}
