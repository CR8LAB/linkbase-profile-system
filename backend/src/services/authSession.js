import jwt from "jsonwebtoken";
import { JWT_EXPIRES_IN_SECONDS, SESSION_MAX_AGE_SECONDS } from "../config/jwt.js";

export const currentSessionTime = () => Math.floor(Date.now() / 1000);

export function getSessionTimes(payload, now = currentSessionTime()) {
  if (!payload || typeof payload !== "object") return null;
  const { exp, iat, sessionStartedAt = iat } = payload;
  if (![exp, iat, sessionStartedAt].every(Number.isSafeInteger) ||
      sessionStartedAt <= 0 || sessionStartedAt > iat || iat > now) {
    return null;
  }
  const expiresAt = Math.min(exp, iat + JWT_EXPIRES_IN_SECONDS, sessionStartedAt + SESSION_MAX_AGE_SECONDS);
  return now < expiresAt ? { startedAt: sessionStartedAt, expiresAt } : null;
}

export function signSessionToken(user, { secret, algorithm }, now = currentSessionTime(), startedAt = now) {
  return jwt.sign({
    userId: user.id,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sessionStartedAt: startedAt,
    iat: now,
    exp: Math.min(now + JWT_EXPIRES_IN_SECONDS, startedAt + SESSION_MAX_AGE_SECONDS),
  }, secret, { algorithm });
}
