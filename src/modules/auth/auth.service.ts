import { prisma } from "@shared/lib/prisma.js";
import { hashPassword, verifyPassword } from "@shared/lib/hashing.js";
import { generateOpaqueToken, hashToken } from "@shared/lib/token.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@shared/lib/jwt.js";
import { generateUniqueBusinessSlug } from "@shared/lib/slug.js";
import { AppError, UnauthorizedError, ValidationError } from "@shared/lib/errors.js";
import { loginAttemptGuard } from "@shared/lib/login-attempt-guard.js";
import { sendNotification } from "@modules/notifications/notifications.service.js";
import { env } from "@config/env.js";
import { authRepository } from "./auth.repository.js";
import type {
  RegisterInput,
  LoginInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from "./auth.schema.js";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30gg, coerente con JWT_REFRESH_EXPIRES_IN

function msFromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

async function issueTokenPair(userId: string, role: string, businessId?: string) {
  const accessToken = signAccessToken({ sub: userId, role, businessId });

  const { token: refreshTokenRaw, hash } = generateOpaqueToken();
  const refreshRow = await authRepository.storeRefreshToken(
    userId,
    hash,
    msFromNow(REFRESH_TOKEN_TTL_MS)
  );
  const refreshToken = signRefreshToken({ sub: userId, tokenId: refreshRow.id });

  return { accessToken, refreshToken, refreshTokenRaw };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      throw new AppError("EMAIL_ALREADY_REGISTERED", "This email is already registered.", 409);
    }

    const passwordHash = await hashPassword(input.password);
    const slug = await generateUniqueBusinessSlug(input.businessName);

    // Transazione: user + business + subscription trial devono essere creati atomicamente.
    const { user, business } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          role: "OWNER",
          status: "PENDING_VERIFICATION",
        },
      });

      const business = await tx.business.create({
        data: {
          ownerId: user.id,
          name: input.businessName,
          slug,
          status: "ONBOARDING",
        },
      });

      await tx.subscription.create({
        data: {
          businessId: business.id,
          plan: "TRIAL",
          status: "TRIALING",
          trialEndsAt: msFromNow(14 * 24 * 60 * 60 * 1000), // 14gg di prova
        },
      });

      return { user, business };
    });

    // Invio (per ora simulato) dell'email di verifica.
    const { token: verifyTokenRaw } = generateOpaqueToken();
    await sendNotification({
      businessId: business.id,
      channel: "EMAIL",
      eventType: "auth.verify_email",
      recipient: user.email,
      payload: { verifyToken: verifyTokenRaw, appUrl: env.APP_URL },
    });

    const tokens = await issueTokenPair(user.id, user.role, business.id);

    return {
      user: sanitizeUser(user),
      business,
      ...tokens,
    };
  },

  async login(input: LoginInput) {
    if (await loginAttemptGuard.isLocked(input.email)) {
      throw new AppError(
        "TOO_MANY_ATTEMPTS",
        "Too many failed login attempts. Please try again later or reset your password.",
        429
      );
    }

    const user = await authRepository.findUserByEmail(input.email);
    if (!user) {
      await loginAttemptGuard.recordFailure(input.email);
      throw new UnauthorizedError("Invalid email or password.");
    }

    const validPassword = await verifyPassword(user.passwordHash, input.password);
    if (!validPassword) {
      await loginAttemptGuard.recordFailure(input.email);
      throw new UnauthorizedError("Invalid email or password.");
    }

    if (user.status === "SUSPENDED") {
      throw new UnauthorizedError("This account has been suspended.");
    }

    await loginAttemptGuard.reset(input.email);

    const business = await authRepository.findFirstBusinessForOwner(user.id);
    const tokens = await issueTokenPair(user.id, user.role, business?.id);

    return { user: sanitizeUser(user), business, ...tokens };
  },

  async refresh(refreshTokenRaw: string) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshTokenRaw);
    } catch {
      throw new UnauthorizedError("Invalid or expired refresh token.");
    }

    const stored = await authRepository.findRefreshTokenById(payload.tokenId);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Refresh token has been revoked or expired.");
    }

    if (stored.tokenHash !== hashToken(refreshTokenRaw)) {
      // Il token non corrisponde all'hash salvato: possibile riuso/manomissione.
      // Per sicurezza revochiamo tutti i refresh token dell'utente.
      await authRepository.revokeAllRefreshTokensForUser(stored.userId);
      throw new UnauthorizedError("Refresh token mismatch. All sessions have been revoked.");
    }

    // Rotazione: il vecchio token viene sempre invalidato.
    await authRepository.revokeRefreshToken(stored.id);

    const user = await authRepository.findUserById(stored.userId);
    if (!user) throw new UnauthorizedError();

    const business = await authRepository.findFirstBusinessForOwner(user.id);
    return issueTokenPair(user.id, user.role, business?.id);
  },

  async logout(refreshTokenRaw: string) {
    try {
      const payload = verifyRefreshToken(refreshTokenRaw);
      await authRepository.revokeRefreshToken(payload.tokenId);
    } catch {
      // Logout deve essere idempotente: un token già scaduto/non valido non è un errore.
    }
  },

  async forgotPassword(input: ForgotPasswordInput) {
    const user = await authRepository.findUserByEmail(input.email);
    // Non riveliamo se l'email esiste o meno (previene enumeration).
    if (!user) return;

    const { token, hash } = generateOpaqueToken();
    await authRepository.createPasswordResetToken(
      user.id,
      hash,
      msFromNow(env.PASSWORD_RESET_TOKEN_EXPIRES_MIN * 60 * 1000)
    );

    await sendNotification({
      businessId: null,
      channel: "EMAIL",
      eventType: "auth.password_reset",
      recipient: user.email,
      payload: { resetToken: token, appUrl: env.APP_URL },
    });
  },

  async resetPassword(input: ResetPasswordInput) {
    const resetToken = await authRepository.findValidPasswordResetTokenByRawToken(input.token);
    if (!resetToken) {
      throw new ValidationError("Invalid or expired password reset token.");
    }

    const passwordHash = await hashPassword(input.newPassword);
    await authRepository.updateUserPassword(resetToken.userId, passwordHash);
    await authRepository.markPasswordResetTokenUsed(resetToken.id);
    // Invalida tutte le sessioni esistenti dopo un reset password.
    await authRepository.revokeAllRefreshTokensForUser(resetToken.userId);
  },

  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError();

    const validPassword = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!validPassword) {
      throw new ValidationError("Current password is incorrect.");
    }

    const passwordHash = await hashPassword(input.newPassword);
    await authRepository.updateUserPassword(userId, passwordHash);
    await authRepository.revokeAllRefreshTokensForUser(userId);
  },
};

// Non esporre mai passwordHash al client.
function sanitizeUser<T extends { passwordHash: string }>(user: T) {
  const { passwordHash, ...safe } = user;
  return safe;
}
