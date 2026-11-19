import assert from "node:assert/strict";
import test from "node:test";
import { assignProfileAtomically } from "../src/services/profileConcurrency.js";

test("profile assignment uses an atomic unassigned-row condition", async () => {
  const calls = [];
  const queryCalls = [];
  const tx = {
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?");
      queryCalls.push({ sql, values });
      if (sql.includes('FROM "User"')) {
        return [{ id: "customer-1", role: "CUSTOMER", email: "customer@example.test" }];
      }
      return [{ id: "profile-1", publicId: "LB001", fullName: "Test", userId: null }];
    },
    profile: {
      async findFirst() { return null; },
      async updateMany(args) {
        calls.push(args);
        return { count: 1 };
      },
    },
  };

  const result = await assignProfileAtomically(tx, "LB001", "customer-1");
  assert.equal(result.status, "assigned");
  assert.match(queryCalls[0].sql, /FROM "User"[\s\S]*FOR UPDATE/);
  assert.deepEqual(queryCalls[0].values, ["customer-1"]);
  assert.match(queryCalls[1].sql, /FROM "Profile"[\s\S]*FOR UPDATE/);
  assert.deepEqual(queryCalls[1].values, ["LB001"]);
  assert.deepEqual(calls, [{
    where: { publicId: "LB001", userId: null },
    data: { userId: "customer-1" },
  }]);
});

test("profile assignment reports a conflict when a concurrent update wins", async () => {
  const tx = {
    async $queryRaw(strings) {
      const sql = strings.join("?");
      return sql.includes('FROM "User"')
        ? [{ id: "customer-2", role: "CUSTOMER", email: "b@example.test" }]
        : [{ id: "profile-1", publicId: "LB001", fullName: "Test", userId: null }];
    },
    profile: {
      async findFirst() { return null; },
      async updateMany() { return { count: 0 }; },
    },
  };

  assert.deepEqual(
    await assignProfileAtomically(tx, "LB001", "customer-2"),
    { status: "profile-conflict" },
  );
});

test("assignment validates the locked user before querying the customer profile", async () => {
  const calls = [];
  const tx = {
    async $queryRaw(strings) {
      calls.push(strings.join("?"));
      return [{ id: "admin-1", role: "ADMIN", email: "admin@example.test" }];
    },
    profile: {
      async findFirst() { assert.fail("Customer profile must not be queried for an administrator"); },
    },
  };

  assert.deepEqual(await assignProfileAtomically(tx, "LB001", "admin-1"), { status: "invalid-customer" });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /FROM "User"[\s\S]*FOR UPDATE/);
});
