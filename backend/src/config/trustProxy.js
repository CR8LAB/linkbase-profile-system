export function getTrustProxySetting(env = process.env) {
  return env.NODE_ENV === "production" ? 1 : false;
}
