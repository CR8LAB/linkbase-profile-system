import assert from "node:assert/strict";
import test from "node:test";
import { unassignLb0011 } from "../scripts/unassignLb0011.js";

const original = {
  id: "profile-11",
  publicId: "LB0011",
  fullName: "Mia Mthembu",
  shortCode: "b2174baaff48",
  email: "public@example.test",
  companyId: "company-1",
  userId: "",
  user: { email: "testcustomer@example.com", role: "CUSTOMER" },
};

function createFixture({ profile = original, updatedRows = 1 } = {}) {
  const state = { profile, unusedInvitations: 1, transactions: 0, commits: 0 };
  const output = [];
  const database = {
    profile: {
      async findUnique({ where }) {
        assert.deepEqual(where, { publicId: "LB0011" });
        return state.profile;
      },
    },
    profileClaimToken: {
      async count({ where }) {
        assert.equal(where.profileId, original.id);
        assert.equal(where.usedAt, null);
        return state.unusedInvitations;
      },
    },
    async $transaction(work) {
      state.transactions++;
      const draft = { ...state };
      const result = await work({
        profileClaimToken: {
          async updateMany({ where, data }) {
            assert.deepEqual(where, { profileId: original.id, usedAt: null });
            assert.ok(data.usedAt instanceof Date);
            draft.unusedInvitations = 0;
            return { count: state.unusedInvitations };
          },
        },
        profile: {
          async updateMany({ where, data }) {
            assert.deepEqual(where, {
              id: original.id,
              publicId: "LB0011",
              userId: "",
              user: { is: { email: "testcustomer@example.com", role: "CUSTOMER" } },
            });
            assert.deepEqual(data, { userId: null });
            draft.profile = { ...draft.profile, userId: null, user: null };
            return { count: updatedRows };
          },
        },
      });
      Object.assign(state, draft);
      state.commits++;
      return result;
    },
  };
  return { database, state, output, log: (...args) => output.push(args) };
}

test("the default dry run accepts a linked customer with an empty-string ID", async () => {
  const { database, state, output, log } = createFixture();
  await unassignLb0011(database, { log });
  assert.equal(output[0][0], "Dry run");
  assert.equal(output[0][1].currentOwner, "testcustomer@example.com");
  assert.equal(state.transactions, 0);
  assert.equal(state.profile.userId, "");
});

test("ownership requires a present ID and the expected linked customer email and role", async () => {
  for (const overrides of [
    { userId: null },
    { userId: undefined },
    { user: null },
    { user: { ...original.user, email: "someone-else@example.test" } },
    { user: { ...original.user, role: "ADMIN" } },
  ]) {
    const { database, state, log } = createFixture({ profile: { ...original, ...overrides } });
    await assert.rejects(unassignLb0011(database, { reviewedProfileId: original.id, log }), /expected test customer/);
    assert.equal(state.transactions, 0);
  }
});

test("the guarded update keeps the empty owner ID and scopes both writes to LB0011", async () => {
  const { database, state, output, log } = createFixture();
  await unassignLb0011(database, { reviewedProfileId: original.id, log });
  assert.equal(state.commits, 1);
  assert.deepEqual(state.profile, { ...original, userId: null, user: null });
  assert.equal(state.unusedInvitations, 0);
  assert.match(output.at(-1)[0], /Verified LB0011/);
});

test("a different reviewed profile ID is rejected before a transaction starts", async () => {
  const { database, state, log } = createFixture();
  await assert.rejects(unassignLb0011(database, { reviewedProfileId: "another-profile", log }), /reviewed profile ID/);
  assert.equal(state.transactions, 0);
});

test("an ownership conflict aborts the transaction and rolls back invitation invalidation", async () => {
  const { database, state, log } = createFixture({ updatedRows: 0 });
  await assert.rejects(unassignLb0011(database, { reviewedProfileId: original.id, log }), /rolled back/);
  assert.equal(state.transactions, 1);
  assert.equal(state.commits, 0);
  assert.equal(state.profile.userId, "");
  assert.equal(state.unusedInvitations, 1);
});
