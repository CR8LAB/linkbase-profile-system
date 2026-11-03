import rateLimit from "express-rate-limit";

export function createAuthRateLimit(max) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
  });
}

export const loginRateLimit = createAuthRateLimit(10);
export const invitationRateLimit = createAuthRateLimit(10);
export const claimRateLimit = createAuthRateLimit(5);
export const resetRequestRateLimit = createAuthRateLimit(5);
export const resetCompleteRateLimit = createAuthRateLimit(10);
