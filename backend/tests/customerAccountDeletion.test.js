import assert from "node:assert/strict";
import test from "node:test";
import {
  createCustomerAccountDeletionHandler,
} from "../src/services/customerAccountDeletion.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

function createDatabase({ user, profile = null, resetTokens = [], failDelete = false }) {
  const state = structuredClone({
    users: user ? [user] : [],
    profiles: profile ? [profile] : [],
    resetTokens,
  });

  return {
    state,
    async transaction(work) {
      const draft = structuredClone(state);
      const tx = {
        user: {
          async findUnique({ where }) {
            return draft.users.find((item) => item.id === where.id) || null;
          },
          async delete({ where }) {
            if (failDelete) throw new Error("simulated delete failure");
            draft.users = draft.users.filter((item) => item.id !== where.id);
            draft.resetTokens = draft.resetTokens.filter(
              (token) => token.userId !== where.id,
            );
          },
        },
        profile: {
          async updateMany({ where, data }) {
            for (const item of draft.profiles) {
              if (item.userId === where.userId) item.userId = data.userId;
            }
          },
        },
      };

      const result = await work(tx);
      state.users = draft.users;
      state.profiles = draft.profiles;
      state.resetTokens = draft.resetTokens;
      return result;
    },
  };
}

function createHandler(database) {
  let transactionCalls = 0;
  const handler = createCustomerAccountDeletionHandler({
    transaction(work) {
      transactionCalls += 1;
      return database.transaction(work);
    },
  });
  return { handler, getTransactionCalls: () => transactionCalls };
}

const customer = { id: "customer-1", role: "CUSTOMER", email: "person@example.com" };
const assignedProfile = {
  id: "profile-1",
  userId: customer.id,
  publicId: "LB001",
  shortCode: "a1b2c3d4e5f6",
  companyId: "company-1",
  pdfUrl: "/api/profiles/LB001/pdf/download",
  pdfDisplayName: "Guide.pdf",
  photoUrl: "https://storage.example/photo.webp",
  logoUrl: "https://storage.example/logo.webp",
  socialLinks: [{ id: "social-1", platform: "linkedin", url: "https://example.com" }],
  visits: [{ id: "visit-1", createdAt: "2026-01-01T00:00:00Z" }],
};

test("deleting a customer preserves and unassigns their public profile and assets", async () => {
  const database = createDatabase({
    user: customer,
    profile: assignedProfile,
    resetTokens: [{ id: "reset-1", userId: customer.id }],
  });
  const { handler } = createHandler(database);
  const response = createResponse();

  await handler(
    { params: { userId: customer.id }, user: { id: "admin-1", role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(database.state.users, []);
  assert.deepEqual(database.state.profiles, [{ ...assignedProfile, userId: null }]);
  assert.deepEqual(database.state.resetTokens, []);
});

test("deleting a customer without an assigned profile succeeds", async () => {
  const database = createDatabase({ user: customer });
  const { handler } = createHandler(database);
  const response = createResponse();

  await handler(
    { params: { userId: customer.id }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(database.state.users, []);
  assert.deepEqual(database.state.profiles, []);
});

test("deleting a nonexistent customer returns 404", async () => {
  const database = createDatabase({});
  const { handler } = createHandler(database);
  const response = createResponse();

  await handler(
    { params: { userId: "missing" }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, "Customer account not found");
});

test("the customer deletion endpoint refuses administrator accounts", async () => {
  const administrator = { id: "admin-2", role: "ADMIN", email: "admin@example.com" };
  const database = createDatabase({ user: administrator });
  const { handler } = createHandler(database);
  const response = createResponse();

  await handler(
    { params: { userId: administrator.id }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /only delete customer accounts/i);
  assert.deepEqual(database.state.users, [administrator]);
});

test("non-admin users are denied before the transaction runs", async () => {
  const database = createDatabase({ user: customer });
  const { handler, getTransactionCalls } = createHandler(database);
  const response = createResponse();

  await handler(
    { params: { userId: customer.id }, user: { role: "CUSTOMER" } },
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(getTransactionCalls(), 0);
  assert.deepEqual(database.state.users, [customer]);
});

test("a failure deleting the account rolls back profile unassignment", async () => {
  const database = createDatabase({
    user: customer,
    profile: assignedProfile,
    resetTokens: [{ id: "reset-1", userId: customer.id }],
    failDelete: true,
  });
  const before = structuredClone(database.state);
  const { handler } = createHandler(database);
  const response = createResponse();

  await handler(
    { params: { userId: customer.id }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(database.state, before);
});
