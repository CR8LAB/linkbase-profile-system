import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {
  getJwtConfig,
  initializeJwtConfig,
  JWT_EXPIRES_IN,
  JWT_EXPIRES_IN_SECONDS,
  SESSION_MAX_AGE_SECONDS,
} from "../src/config/jwt.js";
import {
  createCompletePasswordResetHandler,
  createLoginHandler,
  createLogoutHandler,
  createRenewSessionHandler,
} from "../src/controllers/authController.js";
import {
  createAuthenticate,
  requireAdmin,
} from "../src/middleware/authMiddleware.js";
import { createOneTimeToken, hashOneTimeToken } from "../src/services/authSecurity.js";
import { currentSessionTime, getSessionTimes, signSessionToken } from "../src/services/authSession.js";

initializeJwtConfig(`base64url:${randomBytes(32).toString("base64url")}`);

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    set() {
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeDelegates(getState, options = {}) {
  let userUpdatedInTransaction = false;

  return {
    user: {
      async findUnique({ where }) {
        const state = getState();
        const user = where.id
          ? state.users.find((candidate) => candidate.id === where.id)
          : state.users.find((candidate) => candidate.email === where.email);
        return user ? { ...user } : null;
      },
      async update({ where, data }) {
        const state = getState();
        const user = state.users.find((candidate) => candidate.id === where.id);
        if (!user) throw Object.assign(new Error("User not found"), { code: "P2025" });
        if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash;
        if (data.tokenVersion?.increment !== undefined) {
          user.tokenVersion += data.tokenVersion.increment;
        }
        if (data.passwordHash !== undefined) userUpdatedInTransaction = true;
        return { ...user };
      },
    },
    passwordResetToken: {
      async findUnique({ where }) {
        const token = getState().resetTokens.find(
          (candidate) => candidate.tokenHash === where.tokenHash,
        );
        return token ? { ...token } : null;
      },
      async updateMany({ where, data }) {
        if (
          options.failAfterUserUpdate &&
          userUpdatedInTransaction &&
          where.userId
        ) {
          throw new Error("Injected transaction failure");
        }
        const state = getState();
        const now = new Date();
        const matches = state.resetTokens.filter((candidate) => {
          if (where.id && candidate.id !== where.id) return false;
          if (where.userId && candidate.userId !== where.userId) return false;
          if (where.usedAt === null && candidate.usedAt !== null) return false;
          if (where.expiresAt?.gt && candidate.expiresAt <= where.expiresAt.gt) return false;
          return true;
        });
        for (const token of matches) token.usedAt = data.usedAt;
        return { count: matches.length };
      },
    },
  };
}

function createFakeDatabase({ users, resetTokens = [], failLogout = false, failAfterUserUpdate = false }) {
  let state = structuredClone({ users, resetTokens });
  const delegates = makeDelegates(() => state, { failAfterUserUpdate });
  return {
    ...delegates,
    getState: () => structuredClone(state),
    async $transaction(work) {
      const draft = structuredClone(state);
      const tx = makeDelegates(() => draft, { failAfterUserUpdate });
      const result = await work(tx);
      state = draft;
      return result;
    },
    async logoutUpdate(args) {
      if (failLogout) throw new Error("Injected database failure");
      return delegates.user.update(args);
    },
  };
}

function tokenRequest(token) {
  return { headers: { authorization: `Bearer ${token}` } };
}

async function authenticateToken(database, token) {
  const response = createResponse();
  const request = tokenRequest(token);
  let nextCalled = false;
  await createAuthenticate(database)(request, response, () => {
    nextCalled = true;
  });
  return { response, request, nextCalled };
}

async function loginUser(database, email, password) {
  const response = createResponse();
  await createLoginHandler(database)({ body: { email, password } }, response);
  return response;
}

async function makeUser(id, role = "CUSTOMER", password = "current-password-123") {
  return {
    id,
    email: `${id}@example.com`,
    role,
    tokenVersion: 0,
    passwordHash: await bcrypt.hash(password, 4),
  };
}

test("login issues 60-minute HS256 tokens and authentication rejects other algorithms", async () => {
  const user = await makeUser("customer-algorithm");
  const database = createFakeDatabase({ users: [user] });
  const loginResponse = await loginUser(database, user.email, "current-password-123");

  assert.equal(loginResponse.statusCode, 200);
  const decodedToken = jwt.decode(loginResponse.body.token, { complete: true });
  assert.equal(decodedToken.header.alg, "HS256");
  assert.equal(decodedToken.payload.exp - decodedToken.payload.iat, JWT_EXPIRES_IN_SECONDS);
  assert.equal(JWT_EXPIRES_IN, "60m");
  assert.equal(decodedToken.payload.sessionStartedAt, decodedToken.payload.iat);
  assert.equal((await authenticateToken(database, loginResponse.body.token)).nextCalled, true);
  assert.doesNotThrow(() =>
    jwt.verify(loginResponse.body.token, getJwtConfig().secret, {
      algorithms: ["HS256"],
      clockTimestamp: decodedToken.payload.iat + JWT_EXPIRES_IN_SECONDS - 1,
    }),
  );

  const expiredToken = jwt.sign(
    {
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      iat: Math.floor(Date.now() / 1000) - JWT_EXPIRES_IN_SECONDS - 1,
    },
    getJwtConfig().secret,
    { algorithm: "HS256", expiresIn: JWT_EXPIRES_IN },
  );
  assert.throws(
    () => jwt.verify(expiredToken, getJwtConfig().secret, { algorithms: ["HS256"] }),
    /jwt expired/,
  );
  const expiredAuth = await authenticateToken(database, expiredToken);
  assert.equal(expiredAuth.response.statusCode, 401);
  assert.equal(expiredAuth.nextCalled, false);

  const previouslyIssuedEightHourToken = jwt.sign(
    {
      userId: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
      iat: Math.floor(Date.now() / 1000) - JWT_EXPIRES_IN_SECONDS - 1,
    },
    getJwtConfig().secret,
    { algorithm: "HS256", expiresIn: "8h" },
  );
  const legacyTokenAuth = await authenticateToken(database, previouslyIssuedEightHourToken);
  assert.equal(legacyTokenAuth.response.statusCode, 401);
  assert.equal(legacyTokenAuth.nextCalled, false);

  const otherAlgorithmToken = jwt.sign(
    { userId: user.id, role: user.role, tokenVersion: user.tokenVersion },
    getJwtConfig().secret,
    { algorithm: "HS384", expiresIn: JWT_EXPIRES_IN },
  );
  const rejected = await authenticateToken(database, otherAlgorithmToken);
  assert.equal(rejected.response.statusCode, 401);
  assert.equal(rejected.nextCalled, false);
});

test("renewal slides the deadline without changing the session start or exceeding eight hours", async () => {
  const user = await makeUser("company-admin-renewal", "COMPANY_ADMIN");
  const database = createFakeDatabase({ users: [user] });
  const token = (await loginUser(database, user.email, "current-password-123")).body.token;
  const initial = jwt.decode(token);
  const firstRenewal = initial.iat + 600;
  let auth = await authenticateToken(database, token);
  assert.equal(auth.nextCalled, true);
  const renewed = createResponse();
  createRenewSessionHandler(getJwtConfig, () => firstRenewal)(auth.request, renewed);
  const updated = jwt.decode(renewed.body.token);
  assert.equal(updated.exp, firstRenewal + JWT_EXPIRES_IN_SECONDS);
  assert.equal(updated.sessionStartedAt, initial.sessionStartedAt);
  assert.equal(updated.role, "COMPANY_ADMIN");
  assert.equal(updated.tokenVersion, user.tokenVersion);
  assert.equal(getSessionTimes(initial, initial.exp), null);

  const now = currentSessionTime();
  const started = now - SESSION_MAX_AGE_SECONDS + 60;
  const nearCap = signSessionToken(user, getJwtConfig(), now - 60, started);
  auth = await authenticateToken(database, nearCap);
  assert.equal(auth.nextCalled, true);
  const capped = createResponse();
  createRenewSessionHandler(getJwtConfig, () => now)(auth.request, capped);
  assert.equal(jwt.decode(capped.body.token).exp, started + SESSION_MAX_AGE_SECONDS);
  const tooLate = createResponse();
  createRenewSessionHandler(getJwtConfig, () => started + SESSION_MAX_AGE_SECONDS)(auth.request, tooLate);
  assert.equal(tooLate.statusCode, 401);
  assert.equal(getSessionTimes(jwt.decode(capped.body.token), started + SESSION_MAX_AGE_SECONDS), null);
});

test("legacy signed tokens retain their original deadline and can renew before it", async () => {
  const user = await makeUser("legacy-session");
  const database = createFakeDatabase({ users: [user] });
  const token = jwt.sign({ userId: user.id, tokenVersion: 0 }, getJwtConfig().secret, { expiresIn: "20m" });
  const legacy = jwt.decode(token);
  const auth = await authenticateToken(database, token);
  assert.deepEqual(auth.request.authSession, { startedAt: legacy.iat, expiresAt: legacy.exp, tokenVersion: 0 });
  const response = createResponse();
  createRenewSessionHandler(getJwtConfig, () => legacy.exp - 1)(auth.request, response);
  assert.equal(jwt.decode(response.body.token).sessionStartedAt, legacy.iat);
  assert.equal(getSessionTimes(legacy, legacy.exp), null);
});

test("logout invalidates the old token but leaves another customer's session valid", async () => {
  const users = [await makeUser("customer-a"), await makeUser("customer-b")];
  const database = createFakeDatabase({ users });
  const tokenA = (await loginUser(database, users[0].email, "current-password-123")).body.token;
  const tokenB = (await loginUser(database, users[1].email, "current-password-123")).body.token;

  assert.equal((await authenticateToken(database, tokenA)).nextCalled, true);
  assert.equal((await authenticateToken(database, tokenB)).nextCalled, true);

  const logoutResponse = createResponse();
  await createLogoutHandler({
    user: { update: (args) => database.logoutUpdate(args) },
  })({ user: { id: "customer-a" } }, logoutResponse);

  assert.equal(logoutResponse.statusCode, 200);
  assert.equal((await authenticateToken(database, tokenA)).response.statusCode, 401);
  assert.equal((await authenticateToken(database, tokenB)).nextCalled, true);
});

test("password reset invalidates old tokens and a newly issued token works", async () => {
  const password = "current-password-123";
  const user = await makeUser("customer-reset", "CUSTOMER", password);
  const resetToken = createOneTimeToken();
  const database = createFakeDatabase({
    users: [user],
    resetTokens: [{
      id: "reset-1",
      tokenHash: hashOneTimeToken(resetToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    }],
  });
  const oldToken = (await loginUser(database, user.email, password)).body.token;

  const resetResponse = createResponse();
  await createCompletePasswordResetHandler(database)(
    { body: { token: resetToken, password: "new-password-456" } },
    resetResponse,
  );

  assert.equal(resetResponse.statusCode, 200);
  assert.equal((await authenticateToken(database, oldToken)).response.statusCode, 401);

  const newLogin = await loginUser(database, user.email, "new-password-456");
  assert.equal(newLogin.statusCode, 200);
  assert.equal(
    jwt.verify(newLogin.body.token, getJwtConfig().secret, {
      algorithms: ["HS256"],
    }).tokenVersion,
    1,
  );
  assert.equal((await authenticateToken(database, newLogin.body.token)).nextCalled, true);
});

test("authentication rejects missing and malformed token versions", async () => {
  const user = await makeUser("customer-malformed");
  const database = createFakeDatabase({ users: [user] });
  const jwtSecret = getJwtConfig().secret;
  const invalidTokens = [
    jwt.sign({ userId: user.id, role: user.role }, jwtSecret, { algorithm: "HS256" }),
    jwt.sign({ userId: user.id, role: user.role, tokenVersion: "0" }, jwtSecret, { algorithm: "HS256" }),
    jwt.sign({ userId: user.id, role: user.role, tokenVersion: -1 }, jwtSecret, { algorithm: "HS256" }),
  ];

  for (const token of invalidTokens) {
    const result = await authenticateToken(database, token);
    assert.equal(result.response.statusCode, 401);
    assert.equal(result.nextCalled, false);
  }
});

test("database failures do not claim logout or password-reset success", async () => {
  const user = await makeUser("customer-errors");
  const failedLogoutDatabase = createFakeDatabase({ users: [user], failLogout: true });
  const logoutResponse = createResponse();
  await createLogoutHandler({
    user: { update: (args) => failedLogoutDatabase.logoutUpdate(args) },
  })({ user: { id: user.id } }, logoutResponse);
  assert.equal(logoutResponse.statusCode, 500);
  assert.notEqual(logoutResponse.body.success, true);

  const resetToken = createOneTimeToken();
  const resetDatabase = createFakeDatabase({
    users: [user],
    failAfterUserUpdate: true,
    resetTokens: [{
      id: "reset-rollback",
      tokenHash: hashOneTimeToken(resetToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    }],
  });
  const resetResponse = createResponse();
  await createCompletePasswordResetHandler(resetDatabase)(
    { body: { token: resetToken, password: "replacement-password-789" } },
    resetResponse,
  );

  assert.equal(resetResponse.statusCode, 500);
  assert.notEqual(resetResponse.body.success, true);
  const state = resetDatabase.getState();
  assert.equal(state.users[0].passwordHash, user.passwordHash);
  assert.equal(state.users[0].tokenVersion, 0);
  assert.equal(state.resetTokens[0].usedAt, null);
});

test("database-driven admin authorization remains unchanged", async () => {
  const admin = await makeUser("admin-user", "ADMIN");
  const customer = await makeUser("customer-user");
  const database = createFakeDatabase({ users: [admin, customer] });
  const adminToken = (await loginUser(database, admin.email, "current-password-123")).body.token;
  const customerToken = (await loginUser(database, customer.email, "current-password-123")).body.token;

  const adminAuth = await authenticateToken(database, adminToken);
  let adminAllowed = false;
  requireAdmin(adminAuth.request, createResponse(), () => { adminAllowed = true; });
  assert.equal(adminAllowed, true);

  const customerAuth = await authenticateToken(database, customerToken);
  const forbiddenResponse = createResponse();
  let customerAllowed = false;
  requireAdmin(customerAuth.request, forbiddenResponse, () => { customerAllowed = true; });
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.equal(customerAllowed, false);
});
