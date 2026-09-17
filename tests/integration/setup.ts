import { config } from "dotenv";
import { beforeEach, afterAll } from "vitest";

// Carica .env.test PRIMA che qualsiasi modulo dell'app legga process.env
// (src/config/env.ts viene valutato al primo import di un file che lo richiede,
// quindi questo file deve girare come setupFile, prima dei file di test).
config({ path: ".env.test", override: true });

const { prisma } = await import("@shared/lib/prisma.js");

// Ordine importante per via delle foreign key: prima le tabelle "foglia".
const TABLES_IN_DELETE_ORDER = [
  "notification_logs",
  "webhook_events",
  "appointments",
  "customers",
  "availability_exceptions",
  "availability_rules",
  "services",
  "subscriptions",
  "staff_members",
  "businesses",
  "password_reset_tokens",
  "refresh_tokens",
  "users",
];

async function truncateAll() {
  for (const table of TABLES_IN_DELETE_ORDER) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
