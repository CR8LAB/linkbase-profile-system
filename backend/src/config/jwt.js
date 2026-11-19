export const JWT_ALGORITHM = "HS256";
export const JWT_EXPIRES_IN = "20m";
export const JWT_EXPIRES_IN_SECONDS = 20 * 60;

const knownPlaceholders = new Set([
  "change-me",
  "changeme",
  "example",
  "generate-me",
  "placeholder",
  "replace-with-a-long-random-secret",
  "secret",
  "your-secret",
  "your_jwt_secret",
]);

let activeJwtConfig;

function reject(message) {
  throw new Error(message);
}

export function decodeJwtSecret(value) {
  if (typeof value !== "string" || !value.trim()) {
    return reject("JWT_SECRET must be configured");
  }

  const secret = value.trim();
  const separator = secret.indexOf(":");
  if (separator < 0) {
    return reject("JWT_SECRET must use the hex: or base64url: encoding prefix");
  }

  const format = secret.slice(0, separator);
  const encodedKey = secret.slice(separator + 1);
  if (
    knownPlaceholders.has(encodedKey.toLowerCase()) ||
    /^(.)\1{7,}$/.test(encodedKey)
  ) {
    return reject("JWT_SECRET must be generated randomly, not a placeholder");
  }

  let key;
  if (format === "hex") {
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(encodedKey)) {
      return reject("JWT_SECRET hex encoding is invalid");
    }
    key = Buffer.from(encodedKey, "hex");
    if (key.toString("hex") !== encodedKey.toLowerCase()) {
      return reject("JWT_SECRET hex encoding is invalid");
    }
  } else if (format === "base64url") {
    if (!/^[A-Za-z0-9_-]+$/.test(encodedKey)) {
      return reject("JWT_SECRET base64url encoding is invalid");
    }
    key = Buffer.from(encodedKey, "base64url");
    if (key.toString("base64url") !== encodedKey) {
      return reject("JWT_SECRET base64url encoding is invalid");
    }
  } else {
    return reject("JWT_SECRET must use the hex: or base64url: encoding prefix");
  }

  if (key.byteLength < 32) {
    return reject("JWT_SECRET must contain at least 32 decoded bytes");
  }
  if (key.every((byte) => byte === key[0])) {
    return reject("JWT_SECRET must not use a repeated-byte placeholder key");
  }

  return key;
}

export function initializeJwtConfig(value) {
  const configuredValue =
    arguments.length === 0 ? process.env.JWT_SECRET : value;
  activeJwtConfig = undefined;
  const secret = decodeJwtSecret(configuredValue);
  activeJwtConfig = { secret, algorithm: JWT_ALGORITHM };
  return getJwtConfig();
}

export function getJwtConfig() {
  if (!activeJwtConfig) return initializeJwtConfig();
  return {
    secret: Buffer.from(activeJwtConfig.secret),
    algorithm: activeJwtConfig.algorithm,
  };
}
