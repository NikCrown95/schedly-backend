import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "@config/env.js";

// Payload minimo nel token: mai includere dati sensibili (password, ecc.)
// businessId viene incluso quando l'utente ha (per l'MVP) una sola business attiva —
// questo è ciò che il tenantGuard userà per scoping automatico, MAI un valore letto
// da params/body della richiesta.
export interface AccessTokenPayload {
  sub: string; // userId
  businessId?: string;
  role: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  tokenId: string; // id della riga RefreshToken in DB, per revoca/rotazione
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
