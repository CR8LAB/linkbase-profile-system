import assert from "node:assert/strict";
import test from "node:test";
import {
  createCompanyDeletionHandler,
  deleteCompanyWithNoProfiles,
} from "../src/services/companyDeletion.js";

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

function createHandler({ result = { status: "deleted" } } = {}) {
  const calls = { deletes: 0 };
  const handler = createCompanyDeletionHandler({
    async deleteCompanyIfUnassociated() {
      calls.deletes += 1;
      return result;
    },
  });
  return { handler, calls };
}

test("admin can delete a company that has no profiles", async () => {
  const { handler, calls } = createHandler({ result: { status: "deleted" } });
  const response = createResponse();

  await handler(
    { params: { companyId: "company-1" }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(calls.deletes, 1);
});

test("company deletion is blocked while profiles are associated", async () => {
  const { handler, calls } = createHandler({ result: { status: "profiles-associated" } });
  const response = createResponse();

  await handler(
    { params: { companyId: "company-1" }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /reassign the profiles/i);
  assert.equal(calls.deletes, 1);
});

test("deleting a nonexistent company returns 404", async () => {
  const { handler, calls } = createHandler({ result: { status: "not-found" } });
  const response = createResponse();

  await handler(
    { params: { companyId: "missing" }, user: { role: "ADMIN" } },
    response,
  );

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.message, "Company not found");
  assert.equal(calls.deletes, 1);
});

test("non-admin users cannot delete companies", async () => {
  const { handler, calls } = createHandler();
  const response = createResponse();

  await handler(
    { params: { companyId: "company-1" }, user: { role: "CUSTOMER" } },
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.equal(calls.deletes, 0);
});

test("transactional deletion locks the company before checking profiles", async () => {
  const calls = [];
  const tx = {
    async $queryRaw(strings, companyId) {
      calls.push({ type: "lock", sql: strings.join("?"), companyId });
      return [{ id: companyId }];
    },
    profile: {
      async count({ where }) {
        calls.push({ type: "count", companyId: where.companyId });
        return 0;
      },
    },
    company: {
      async delete({ where }) {
        calls.push({ type: "delete", companyId: where.id });
      },
    },
  };

  const result = await deleteCompanyWithNoProfiles(tx, "company-1");

  assert.deepEqual(result, { status: "deleted" });
  assert.deepEqual(calls.map(({ type }) => type), ["lock", "count", "delete"]);
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.equal(calls[0].companyId, "company-1");
});

test("transactional deletion does not delete a company with profiles", async () => {
  let wasDeleted = false;
  const tx = {
    async $queryRaw() { return [{ id: "company-1" }]; },
    profile: { async count() { return 1; } },
    company: { async delete() { wasDeleted = true; } },
  };

  const result = await deleteCompanyWithNoProfiles(tx, "company-1");

  assert.deepEqual(result, { status: "profiles-associated" });
  assert.equal(wasDeleted, false);
});

test("transactional deletion returns not-found without counting profiles", async () => {
  let countedProfiles = false;
  const tx = {
    async $queryRaw() { return []; },
    profile: { async count() { countedProfiles = true; return 0; } },
    company: { async delete() { assert.fail("must not delete a missing company"); } },
  };

  const result = await deleteCompanyWithNoProfiles(tx, "missing");

  assert.deepEqual(result, { status: "not-found" });
  assert.equal(countedProfiles, false);
});
