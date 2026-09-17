import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("password123");

  const owner = await prisma.user.upsert({
    where: { email: "demo@schedly.app" },
    update: {},
    create: {
      email: "demo@schedly.app",
      passwordHash,
      firstName: "Demo",
      lastName: "Owner",
      role: "OWNER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  const business = await prisma.business.upsert({
    where: { slug: "demo-salon" },
    update: {},
    create: {
      ownerId: owner.id,
      name: "Demo Salon",
      slug: "demo-salon",
      category: "hairdresser",
      timezone: "Europe/Rome",
      status: "ACTIVE",
    },
  });

  await prisma.subscription.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      plan: "TRIAL",
      status: "TRIALING",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.service.createMany({
    data: [
      { businessId: business.id, name: "Taglio uomo", durationMinutes: 30, priceCents: 2000 },
      { businessId: business.id, name: "Taglio + barba", durationMinutes: 45, priceCents: 3000 },
    ],
    skipDuplicates: true,
  });

  // Lun-Ven 09:00-13:00, 14:00-18:00
  const weekdayRules = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
    { businessId: business.id, dayOfWeek, startTime: "09:00", endTime: "13:00" },
    { businessId: business.id, dayOfWeek, startTime: "14:00", endTime: "18:00" },
  ]);
  await prisma.availabilityRule.createMany({ data: weekdayRules, skipDuplicates: true });

  console.log("✅ Seed completato:", { owner: owner.email, business: business.slug });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
