import { prisma } from "@shared/lib/prisma.js";
import { NotFoundError } from "@shared/lib/errors.js";
import type { UpdateProfileInput } from "./users.schema.js";

export const usersService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundError("User");

    const business = await prisma.business.findFirst({ where: { ownerId: userId } });

    return { user, business };
  },

  async updateProfile(userId: string, input: UpdateProfileInput) {
    return prisma.user.update({
      where: { id: userId },
      data: input,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
      },
    });
  },
};
