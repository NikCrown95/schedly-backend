import { redis } from "@shared/lib/redis.js";

// Protezione complementare al rate limit per-IP sulla rotta /auth/login: quella
// blocca un IP che martella la rotta, questa blocca i tentativi ripetuti contro
// un singolo ACCOUNT anche se arrivano da IP diversi (botnet, IP rotation).
const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minuti

function key(email: string): string {
  return `login_attempts:${email.toLowerCase()}`;
}

export const loginAttemptGuard = {
  async isLocked(email: string): Promise<boolean> {
    const count = await redis.get(key(email));
    return count !== null && Number(count) >= MAX_ATTEMPTS;
  },

  async recordFailure(email: string): Promise<void> {
    const k = key(email);
    const count = await redis.incr(k);
    if (count === 1) {
      await redis.expire(k, WINDOW_SECONDS);
    }
  },

  async reset(email: string): Promise<void> {
    await redis.del(key(email));
  },
};
