export function getTokenSession(token, now = Date.now()) {
  try {
    const encodedPayload = token.split(".")[1];
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")),
    );

    if (typeof payload.exp !== "number") {
      return { role: null, expired: false, invalid: true, expiresAt: null };
    }

    if (payload.exp * 1000 <= now) {
      return { role: null, expired: true, invalid: false, expiresAt: payload.exp * 1000 };
    }

    return {
      role: payload.role,
      expired: false,
      invalid: false,
      expiresAt: payload.exp * 1000,
      ...(Number.isSafeInteger(payload.sessionStartedAt) && {
        absoluteExpiresAt: (payload.sessionStartedAt + 8 * 60 * 60) * 1000,
      }),
    };
  } catch {
    return { role: null, expired: false, invalid: true, expiresAt: null };
  }
}
