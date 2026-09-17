import { prisma } from "@shared/lib/prisma.js";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // rimuove accenti
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Genera uno slug unico per il business, aggiungendo un suffisso numerico in caso
// di collisione (es. "salone-mario", "salone-mario-2", ...).
export async function generateUniqueBusinessSlug(name: string): Promise<string> {
  const base = slugify(name) || "business";
  let candidate = base;
  let suffix = 1;

  // Limite di sicurezza per evitare loop infiniti in casi patologici.
  while (suffix < 1000) {
    const existing = await prisma.business.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  throw new Error("Unable to generate a unique slug.");
}
