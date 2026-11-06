import { randomBytes } from "node:crypto";

export function generateShortCode() {
  return randomBytes(6).toString("hex");
}

export function isValidShortCode(value) {
  return typeof value === "string" && /^[a-f0-9]{12}$/i.test(value);
}
