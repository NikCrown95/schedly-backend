import { prisma } from "@shared/lib/prisma.js";
import { hashToken } from "@shared/lib/token.js";

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  // Nell'MVP un owner ha un solo business: prendiamo il primo creato.
  // La struttura (User 1-N Business) resta pronta per estendersi in futuro.
  findFirstBusinessForOwner(userId: string) {
    return prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: "asc" },
    });
  },

  async storeRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  },

  findRefreshTokenById(id: string) {
    return prisma.refreshToken.findUnique({ where: { id } });
  },

  async revokeRefreshToken(id: string) {
    await prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  async revokeAllRefreshTokensForUser(userId: string) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  async createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  },

  findValidPasswordResetTokenByRawToken(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    return prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  },

  async markPasswordResetTokenUsed(id: string) {
    await prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  },

  async updateUserPassword(userId: string, passwordHash: string) {
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },
};
