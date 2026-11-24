import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { getTokenSession } from "../src/utils/tokenSession.js";
import {
  createSessionAwareFetch,
  redirectToLoginAfterExpiry,
  SESSION_EXPIRED_MESSAGE,
} from "../src/utils/sessionExpiry.js";

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

test("route guard identifies expired JWTs and keeps unexpired roles", () => {
  const now = 1_800_000_000_000;
  const makeToken = (payload) => `header.${encodePayload(payload)}.signature`;
  assert.deepEqual(
    getTokenSession(makeToken({ exp: now / 1000 - 1, role: "ADMIN" }), now),
    { role: null, expired: true, invalid: false, expiresAt: now - 1000 },
  );
  assert.deepEqual(
    getTokenSession(makeToken({ exp: now / 1000 + 1, role: "CUSTOMER" }), now),
    { role: "CUSTOMER", expired: false, invalid: false, expiresAt: now + 1000 },
  );
});

test("authenticated API 401 clears the local session and signals one login redirect", async () => {
  const values = new Map([["token", "expired-token"]]);
  const storage = {
    getItem: (key) => values.get(key) || null,
    removeItem: (key) => values.delete(key),
  };
  let fetchCount = 0;
  let expiredCount = 0;
  const fetcher = createSessionAwareFetch(
    async () => {
      fetchCount += 1;
      return { status: 401 };
    },
    {
      storage,
      apiBaseUrl: "https://api.example.com",
      onExpired: () => expiredCount += 1,
    },
  );

  const request = {
    headers: new Headers({ Authorization: "Bearer expired-token" }),
  };
  await fetcher("https://api.example.com/api/profiles/my-profile", request);
  await fetcher("https://api.example.com/api/profiles/my-profile", request);

  assert.equal(fetchCount, 2);
  assert.equal(expiredCount, 1);
  assert.equal(storage.getItem("token"), null);
});

test("unauthenticated login 401 does not clear or redirect a session", async () => {
  const values = new Map([["token", "existing-token"]]);
  let expiredCount = 0;
  const fetcher = createSessionAwareFetch(
    async () => ({ status: 401 }),
    {
      storage: { getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) },
      apiBaseUrl: "https://api.example.com",
      onExpired: () => expiredCount += 1,
    },
  );

  await fetcher("https://api.example.com/api/auth/login", { method: "POST" });
  assert.equal(expiredCount, 0);
  assert.equal(values.get("token"), "existing-token");
});

test("a delayed 401 from an older token does not discard a renewed session", async () => {
  const values = new Map([["token", "old-token"]]);
  let completeResponse;
  const fetcher = createSessionAwareFetch(
    () => new Promise((resolve) => { completeResponse = resolve; }),
    {
      storage: { getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) },
      apiBaseUrl: "https://api.example.com",
      onExpired: () => assert.fail("A renewed session was treated as expired"),
    },
  );
  const response = fetcher("https://api.example.com/api/profiles/my-profile", {
    headers: { Authorization: "Bearer old-token" },
  });
  values.set("token", "renewed-token");
  completeResponse({ status: 401 });
  await response;
  assert.equal(values.get("token"), "renewed-token");
});

test("logout handles its own 401 response without a competing expiry redirect", async () => {
  const values = new Map([["token", "expired-token"]]);
  let expiredCount = 0;
  const fetcher = createSessionAwareFetch(
    async () => ({ status: 401 }),
    {
      storage: { getItem: (key) => values.get(key), removeItem: (key) => values.delete(key) },
      apiBaseUrl: "https://api.example.com",
      onExpired: () => expiredCount += 1,
    },
  );

  await fetcher("https://api.example.com/api/auth/logout", {
    method: "POST",
    headers: { Authorization: "Bearer expired-token" },
  });
  assert.equal(expiredCount, 0);
  assert.equal(values.get("token"), "expired-token");
});

test("expired-session navigation replaces history and supplies the login notice", () => {
  let navigation;
  redirectToLoginAfterExpiry((...args) => { navigation = args; });
  assert.equal(navigation[0], "/");
  assert.deepEqual(navigation[1], {
    replace: true,
    state: { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true },
  });
});
