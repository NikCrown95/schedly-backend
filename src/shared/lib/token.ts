import { randomBytes, createHash } from "node:crypto";

// I token opachi (refresh, password reset) vengono generati random, restituiti
// in chiaro al client UNA volta, e salvati in DB solo come hash (sha256) —
// così un leak del database non espone token utilizzabili.
export function generateOpaqueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
