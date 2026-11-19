import { createHmac, randomBytes } from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { isValidEmail, normalizeEmail } from "../services/authSecurity.js";

const accountRateLimitSecret = randomBytes(32);
const resetRequestMessage =
  "If an account matches that email, password reset instructions will be sent.";

export function createAuthRateLimit(max) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
  });
}

export function createAccountRateLimitKey(email, clientIp, secret = accountRateLimitSecret) {
  const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
  if (!isValidEmail(normalizedEmail)) {
    return `ip:${ipKeyGenerator(clientIp)}`;
  }

  const digest = createHmac("sha256", secret)
    .update(normalizedEmail)
    .digest("hex");

  return `account:${digest}`;
}

export function createAuthAccountRateLimit(
  max,
  {
    windowMs = 5 * 60 * 1000,
    secret = accountRateLimitSecret,
    skipSuccessfulRequests = false,
    suppressWhenLimited = false,
  } = {},
) {
  return rateLimit({
    windowMs,
    limit: max,
    keyGenerator: (req) => {
      const email = req.body?.email;
      if (
        !isValidEmail(
          typeof email === "string" ? normalizeEmail(email) : email,
        )
      ) {
        return `ip:${ipKeyGenerator(req.ip)}`;
      }
      return createAccountRateLimitKey(email, req.ip, secret);
    },
    skip: (req) => {
      const email = req.body?.email;
      return !isValidEmail(
        typeof email === "string" ? normalizeEmail(email) : email,
      );
    },
    skipSuccessfulRequests,
    standardHeaders: false,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
    ...(suppressWhenLimited
      ? {
          handler(req, res, next) {
            req.authResetRequestSuppressed = true;
            next();
          },
        }
      : {}),
  });
}

export const loginRateLimit = createAuthRateLimit(10);
export const loginAccountRateLimit = createAuthAccountRateLimit(5, {
  windowMs: 5 * 60 * 1000,
  skipSuccessfulRequests: true,
});
export const invitationRateLimit = createAuthRateLimit(10);
export const claimRateLimit = createAuthRateLimit(5);
export const resetRequestRateLimit = createAuthRateLimit(5);
export const resetRequestAccountRateLimit = createAuthAccountRateLimit(3, {
  windowMs: 15 * 60 * 1000,
  suppressWhenLimited: true,
});
export const resetCompleteRateLimit = createAuthRateLimit(10);
