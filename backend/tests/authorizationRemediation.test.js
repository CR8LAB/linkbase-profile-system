import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../src/config/prisma.js";
import { bucket } from "../src/config/storage.js";
import { initializeJwtConfig, getJwtConfig } from "../src/config/jwt.js";
import profileRoutes from "../src/routes/profileRoutes.js";
import socialLinkRoutes from "../src/routes/socialLinkRoutes.js";
import { createSocialLink } from "../src/controllers/socialLinkController.js";

initializeJwtConfig(`base64url:${randomBytes(32).toString("base64url")}`);

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function withStubs(stubs, callback) {
  const originals = stubs.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, replacement] of stubs) target[key] = replacement;
  try {
    await callback();
  } finally {
    for (const [target, key, original] of originals) target[key] = original;
  }
}

function customerToken(id = "customer-a") {
  return jwt.sign(
    { userId: id, role: "CUSTOMER", tokenVersion: 0 },
    getJwtConfig().secret,
    { algorithm: "HS256", expiresIn: "20m" },
  );
}

async function withHttpServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("social-link creation rejects every non-HTTP scheme before looking up a profile", async () => {
  let profileLookups = 0;
  await withStubs(
    [[prisma.profile, "findUnique", async () => { profileLookups += 1; return { id: "profile-a", userId: "customer-a" }; }]],
    async () => {
      for (const url of [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "ftp://example.com/file",
      ]) {
        const response = createResponse();
        await createSocialLink(
          {
            user: { id: "customer-a", role: "CUSTOMER" },
            body: { profileId: "profile-a", platform: "Website", url },
          },
          response,
        );
        assert.equal(response.statusCode, 400, url);
        assert.match(response.body.message, /HTTP and HTTPS/);
      }
      assert.equal(profileLookups, 0);
    },
  );
});

test("social-link creation preserves profile ownership checks for valid HTTP URLs", async () => {
  let creates = 0;
  await withStubs(
    [
      [prisma.profile, "findUnique", async () => ({ id: "profile-b", userId: "customer-b" })],
      [prisma.socialLink, "create", async () => { creates += 1; return { id: "link-1" }; }],
    ],
    async () => {
      const response = createResponse();
      await createSocialLink(
        {
          user: { id: "customer-a", role: "CUSTOMER" },
          body: { profileId: "profile-b", platform: "Website", url: "https://example.com" },
        },
        response,
      );
      assert.equal(response.statusCode, 403);
      assert.equal(creates, 0);
    },
  );
});

test("social-link creation still accepts HTTP and HTTPS for the assigned customer", async () => {
  let creates = 0;
  await withStubs(
    [
      [prisma, "$transaction", async (work) => work(prisma)],
      [prisma, "$queryRaw", async () => [{ id: "profile-a", companyId: null }]],
      [prisma.profile, "findUnique", async () => ({ id: "profile-a", userId: "customer-a" })],
      [prisma.socialLink, "create", async () => { creates += 1; return { id: `link-${creates}` }; }],
    ],
    async () => {
      for (const url of ["http://example.com", "https://example.com"]) {
        const response = createResponse();
        await createSocialLink(
          {
            user: { id: "customer-a", role: "CUSTOMER" },
            body: { profileId: "profile-a", platform: "Website", url },
          },
          response,
        );
        assert.equal(response.statusCode, 201);
      }
      assert.equal(creates, 2);
    },
  );
});

test("photo, logo and PDF routes reject a foreign owner before parsing the upload", async () => {
  let profileLookups = 0;
  let storageCalls = 0;
  const app = express();
  app.use("/api/profiles", profileRoutes);

  await withStubs(
    [
      [prisma.user, "findUnique", async () => ({ id: "customer-a", role: "CUSTOMER", tokenVersion: 0 })],
      [prisma.profile, "findUnique", async () => {
        profileLookups += 1;
        return { id: "profile-b", publicId: "LB-B", userId: "customer-b" };
      }],
      [bucket, "file", () => { storageCalls += 1; return { save: async () => {} }; }],
    ],
    async () => {
      await withHttpServer(app, async (baseUrl) => {
        const token = customerToken();
        const uploadCases = [
          ["photo", "photo", "text/plain", "owner"],
          ["logo", "logo", "text/plain", "owner"],
          ["pdf", "pdf", "text/plain", "owner"],
          ["background-image", "backgroundImage", "text/plain", "admin"],
        ];

        const unauthenticatedForm = new FormData();
        unauthenticatedForm.append(
          "photo",
          new Blob(["invalid file type"], { type: "text/plain" }),
          "payload.txt",
        );
        const unauthenticatedResponse = await fetch(`${baseUrl}/api/profiles/LB-B/photo`, {
          method: "POST",
          body: unauthenticatedForm,
        });
        assert.equal(unauthenticatedResponse.status, 401);
        assert.equal(profileLookups, 0);

        for (const [route, field, mimeType, authType] of uploadCases) {
          const form = new FormData();
          form.append(field, new Blob(["unauthorized upload"], { type: mimeType }), "payload.txt");
          const response = await fetch(`${baseUrl}/api/profiles/LB-B/${route}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
          assert.equal(response.status, 403, route);
          const message = (await response.json()).message;
          assert.match(message, authType === "admin" ? /administrator/i : /cannot edit this profile/i);
        }
      });
    },
  );

  assert.equal(profileLookups, 3);
  assert.equal(storageCalls, 0);
});

test("PATCH /reorder reaches the reorder handler and validates the complete link set", async () => {
  const updates = [];
  let updateCalls = 0;
  const app = express();
  app.use(express.json());
  app.use("/api/social-links", socialLinkRoutes);

  await withStubs(
    [
      [prisma.user, "findUnique", async () => ({ id: "customer-a", role: "CUSTOMER", tokenVersion: 0 })],
      [prisma.profile, "findUnique", async () => ({ id: "profile-a", userId: "customer-a" })],
      [prisma.socialLink, "findMany", async () => [{ id: "link-1" }, { id: "link-2" }]],
      [prisma.socialLink, "findUnique", async () => null],
      [prisma.socialLink, "update", ({ where, data }) => {
        updateCalls += 1;
        updates.push({ where, data });
        return Promise.resolve({ id: where.id, ...data });
      }],
      [prisma, "$transaction", async (work) => work(prisma)],
      [prisma, "$queryRaw", async () => [{ id: "profile-a", companyId: null }]],
    ],
    async () => {
      await withHttpServer(app, async (baseUrl) => {
        const token = customerToken();
        const response = await fetch(`${baseUrl}/api/social-links/reorder`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ profileId: "profile-a", orderedIds: ["link-2", "link-1"] }),
        });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).success, true);

        const invalidSetResponse = await fetch(`${baseUrl}/api/social-links/reorder`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ profileId: "profile-a", orderedIds: ["link-2", "foreign-link"] }),
        });
        assert.equal(invalidSetResponse.status, 400);
      });
    },
  );

  assert.equal(updateCalls, 2);
  assert.deepEqual(updates, [
    { where: { id: "link-2", profileId: "profile-a" }, data: { sortOrder: 0 } },
    { where: { id: "link-1", profileId: "profile-a" }, data: { sortOrder: 1 } },
  ]);
});
