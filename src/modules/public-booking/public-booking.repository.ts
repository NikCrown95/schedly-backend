import { prisma } from "@shared/lib/prisma.js";

export const publicBookingRepository = {
  // Restituisce il business SOLO se attivo e con abbonamento in stato prenotabile.
  // Un business in ONBOARDING/SUSPENDED o con subscription scaduta viene trattato
  // esattamente come "non trovato", per non rivelare a un chiamante esterno la
  // differenza tra "slug inesistente" e "slug esistente ma disattivato" (anti-enumeration).
  async findBookableBusinessBySlug(slug: string) {
    const business = await prisma.business.findUnique({
      where: { slug },
      include: { subscription: true },
    });

    if (!business) return null;
    if (business.status !== "ACTIVE") return null;
    if (!business.subscription || !["TRIALING", "ACTIVE"].includes(business.subscription.status)) {
      return null;
    }

    return business;
  },

  listActiveServices(businessId: string) {
    return prisma.service.findMany({
      where: { businessId, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        priceCents: true,
        currency: true,
        color: true,
      },
    });
  },

  findActiveService(businessId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
    });
  },

  findAppointmentForCustomerVerification(businessId: string, appointmentId: string) {
    return prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      include: { customer: true },
    });
  },
};
