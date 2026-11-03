import { createHash, randomBytes } from "node:crypto";

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email) {
  return (
    typeof email === "string" &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}

export function createOneTimeToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOneTimeToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidOneTimeToken(token) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}
