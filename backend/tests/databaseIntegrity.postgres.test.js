import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Client } from "pg";
import { assignProfileAtomically } from "../src/services/profileConcurrency.js";
import {
  clearProfilePdfIfUnchanged,
  persistProfilePdfIfUnchanged,
} from "../src/services/profilePdf.js";
import { validateTestDatabaseUrl } from "./databaseIntegrityGuard.js";
import { verifyPostgresClientTls } from "./databaseIntegrityTls.js";

const testDatabaseUrl = validateTestDatabaseUrl(process.env.LINKBASE_TEST_DATABASE_URL);

test(
  "PostgreSQL assignment and PDF concurrency preserve the winning database state",
  { skip: testDatabaseUrl ? false : "Set LINKBASE_TEST_DATABASE_URL to the dedicated test database with its existing schema" },
  async (t) => {
    process.env.NODE_ENV = "test";
    process.env.MVP_DATABASE_URL = testDatabaseUrl.href;
    process.env.GCS_BUCKET_NAME = "linkbase-phase4a-test";

    const [{ default: prisma }, { default: app }, { bucket }, jwtConfig] = await Promise.all([
      import("../src/config/prisma.js"),
      import("../src/app.js"),
      import("../src/config/storage.js"),
      import("../src/config/jwt.js"),
    ]);

    const { initializeJwtConfig, getJwtConfig } = jwtConfig;
    initializeJwtConfig(`base64url:${randomBytes(32).toString("base64url")}`);
    const suffix = randomUUID().replaceAll("-", "");
    const emailPrefix = `phase4a-${suffix}`;
    const publicPrefix = `P4A${suffix.slice(0, 10)}`;
    const bucketName = "linkbase-phase4a-test";
    const objects = new Map();
    const storageEvents = [];
    const originalBucketName = bucket.name;
    const originalBucketFile = bucket.file;
    Object.defineProperty(bucket, "name", { configurable: true, value: bucketName });
    bucket.file = (name) => ({
      async save(buffer) {
        storageEvents.push({ action: "save", name });
        objects.set(name, Buffer.from(buffer));
      },
      async delete() {
        storageEvents.push({ action: "delete", name });
        objects.delete(name);
      },
      async exists() { return [objects.has(name)]; },
      async getSignedUrl() { return [`https://storage.googleapis.com/${bucketName}/${name}?test-signature`]; },
    });

    let server;
    let tlsPreflightClient;
    let company;
    const users = [];
    const profiles = [];
    try {
      try {
        tlsPreflightClient = new Client({
          connectionString: testDatabaseUrl.href,
          connectionTimeoutMillis: 10000,
        });
        await tlsPreflightClient.connect();
        verifyPostgresClientTls(tlsPreflightClient);
        // Verify the existing schema on the same TLS-checked client connection.
        await tlsPreflightClient.query('SELECT 1 FROM "User" LIMIT 1');
        await tlsPreflightClient.end();
        tlsPreflightClient = null;

        await prisma.$connect();
      } catch {
        throw new Error("Could not connect to the isolated test database or verify its existing schema; connection details suppressed");
      }

      company = await prisma.company.create({ data: { name: `Phase 4A ${suffix}` } });
      for (const [index, role] of ["ADMIN", "CUSTOMER", "CUSTOMER", "CUSTOMER"].entries()) {
        users.push(await prisma.user.create({
          data: {
            email: `${emailPrefix}-${index}@example.invalid`,
            passwordHash: "isolated-fixture-only",
            role,
          },
        }));
      }

      const makeProfile = (index, data = {}) => prisma.profile.create({
        data: {
          publicId: `${publicPrefix}${index}`,
          shortCode: randomBytes(6).toString("hex"),
          fullName: `Isolated fixture ${index}`,
          companyId: company.id,
          ...data,
        },
      });
      profiles.push(await makeProfile(1));
      profiles.push(await makeProfile(2));
      profiles.push(await makeProfile(3));

      const jwtConfigValue = getJwtConfig();
      const adminToken = jwt.sign(
        { userId: users[0].id, role: "ADMIN", tokenVersion: users[0].tokenVersion },
        jwtConfigValue.secret,
        { algorithm: "HS256", expiresIn: "20m" },
      );

      server = app.listen(0, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      const api = `http://127.0.0.1:${server.address().port}`;

      await t.test("simultaneous admin assignments yield one success and one 409", async () => {
        const assign = (targetUserId) => fetch(`${api}/api/profiles/${profiles[0].publicId}/assign`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId: targetUserId }),
          signal: AbortSignal.timeout(15000),
        });
        const targetUsers = [users[1], users[2]];
        const responses = await Promise.all(targetUsers.map(({ id }) => assign(id)));
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
        const saved = await prisma.profile.findUnique({ where: { id: profiles[0].id } });
        const winner = responses.findIndex((response) => response.status === 200);
        assert.equal(saved.userId, targetUsers[winner].id);
      });

      await t.test("failed assignment transaction rolls back the profile owner", async () => {
        await assert.rejects(
          prisma.$transaction(async (tx) => {
            const result = await assignProfileAtomically(tx, profiles[1].publicId, users[3].id);
            assert.equal(result.status, "assigned");
            throw new Error("fixture rollback");
          }),
          /fixture rollback/,
        );
        const saved = await prisma.profile.findUnique({ where: { id: profiles[1].id } });
        assert.equal(saved.userId, null);
      });

      await t.test("simultaneous assignments of different profiles to one customer yield one success and one 409", async () => {
        const assign = (profile) => fetch(`${api}/api/profiles/${profile.publicId}/assign`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ userId: users[3].id }),
          signal: AbortSignal.timeout(15000),
        });
        const responses = await Promise.all([assign(profiles[1]), assign(profiles[2])]);
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
        const saved = await prisma.profile.findMany({
          where: { id: { in: [profiles[1].id, profiles[2].id] } },
          select: { id: true, userId: true },
        });
        const winner = responses.findIndex((response) => response.status === 200);
        const ownershipByProfile = new Map(saved.map(({ id, userId }) => [id, userId]));
        assert.equal(ownershipByProfile.get(profiles[1 + winner].id), users[3].id);
        assert.equal(ownershipByProfile.get(profiles[1 + (1 - winner)].id), null);
      });

      await t.test("concurrent PDF replace and remove are compare-and-set operations", async () => {
        const oldUrl = `https://storage.googleapis.com/${bucketName}/profiles/${profiles[2].id}/pdf/${randomUUID()}.pdf`;
        const replacementUrl = `https://storage.googleapis.com/${bucketName}/profiles/${profiles[2].id}/pdf/${randomUUID()}.pdf`;
        await prisma.profile.update({ where: { id: profiles[2].id }, data: { pdfUrl: oldUrl, pdfDisplayName: "old.pdf" } });

        const outcomes = await Promise.all([
          persistProfilePdfIfUnchanged(prisma, profiles[2].publicId, oldUrl, replacementUrl, "replacement.pdf"),
          clearProfilePdfIfUnchanged(prisma, profiles[2].publicId, oldUrl),
        ]);
        const replacementWon = outcomes[0] !== null;
        const removalWon = outcomes[1].count === 1;
        assert.notEqual(replacementWon, removalWon);

        const saved = await prisma.profile.findUnique({ where: { id: profiles[2].id } });
        if (replacementWon) {
          assert.equal(saved.pdfUrl, replacementUrl);
          assert.equal(saved.pdfDisplayName, "replacement.pdf");
        } else {
          assert.equal(saved.pdfUrl, null);
          assert.equal(saved.pdfDisplayName, null);
        }
      });

      await t.test("an older removal cannot clear a replacement that commits first", async () => {
        const oldUrl = `https://storage.googleapis.com/${bucketName}/profiles/${profiles[2].id}/pdf/${randomUUID()}.pdf`;
        const newerUrl = `https://storage.googleapis.com/${bucketName}/profiles/${profiles[2].id}/pdf/${randomUUID()}.pdf`;
        await prisma.profile.update({ where: { id: profiles[2].id }, data: { pdfUrl: oldUrl, pdfDisplayName: "old.pdf" } });

        const replaced = await persistProfilePdfIfUnchanged(prisma, profiles[2].publicId, oldUrl, newerUrl, "new.pdf");
        assert.ok(replaced);
        const staleRemoval = await clearProfilePdfIfUnchanged(prisma, profiles[2].publicId, oldUrl);
        assert.equal(staleRemoval.count, 0);
        const saved = await prisma.profile.findUnique({ where: { id: profiles[2].id } });
        assert.equal(saved.pdfUrl, newerUrl);
        assert.equal(saved.pdfDisplayName, "new.pdf");
      });

      await t.test("HTTP PDF removal racing a buffered replacement cannot erase the winner", async () => {
        const profile = profiles[2];
        const oldObject = `profiles/${profile.id}/pdf/${randomUUID()}.pdf`;
        const oldUrl = `https://storage.googleapis.com/${bucketName}/${oldObject}`;
        await prisma.profile.update({ where: { id: profile.id }, data: { pdfUrl: oldUrl, pdfDisplayName: "old.pdf" } });
        objects.set(oldObject, Buffer.from("old"));

        let saveStarted;
        const saveHasStarted = new Promise((resolve) => { saveStarted = resolve; });
        let releaseSave;
        const saveGate = new Promise((resolve) => { releaseSave = resolve; });
        bucket.file = (name) => ({
          async save(buffer) { saveStarted(); await saveGate; objects.set(name, Buffer.from(buffer)); },
          async delete() { objects.delete(name); },
          async exists() { return [objects.has(name)]; },
          async getSignedUrl() { return [`https://storage.googleapis.com/${bucketName}/${name}?test-signature`]; },
        });

        const uploadForm = new FormData();
        uploadForm.append("pdf", new Blob(["%PDF-1.7 isolated"], { type: "application/pdf" }), "new.pdf");
        const uploadPromise = fetch(`${api}/api/profiles/${profile.publicId}/pdf`, {
          method: "POST",
          headers: { Authorization: `Bearer ${adminToken}` },
          body: uploadForm,
          signal: AbortSignal.timeout(15000),
        }).catch((error) => ({ requestError: error }));
        let saveStartTimeout;
        let removal;
        try {
          const uploadProgress = await Promise.race([
            saveHasStarted.then(() => ({ saved: true })),
            uploadPromise.then((response) => ({ response })),
            new Promise((_, reject) => {
              saveStartTimeout = setTimeout(
                () => reject(new Error("PDF upload did not reach the mocked storage save")),
                10000,
              );
            }),
          ]);
          if (!uploadProgress.saved) {
            if (uploadProgress.response?.requestError) {
              throw new Error(`PDF upload request failed before storage save: ${uploadProgress.response.requestError.name}`);
            }
            const responseMessage = await uploadProgress.response.clone().text();
            throw new Error(`PDF upload returned HTTP ${uploadProgress.response.status} before storage save: ${responseMessage}`);
          }
          removal = await fetch(`${api}/api/profiles/${profile.publicId}/pdf`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${adminToken}` },
            signal: AbortSignal.timeout(15000),
          });
        } finally {
          clearTimeout(saveStartTimeout);
          releaseSave();
        }
        const upload = await uploadPromise;
        assert.equal(removal.status, 200);
        assert.equal(upload.requestError, undefined);
        assert.equal(upload.status, 409);

        const saved = await prisma.profile.findUnique({ where: { id: profile.id } });
        assert.equal(saved.pdfUrl, null);
        assert.equal(saved.pdfDisplayName, null);
        assert.equal(objects.has(oldObject), false);
        assert.equal([...objects.keys()].some((name) => name.startsWith(`profiles/${profile.id}/pdf/`)), false);
      });
    } finally {
      if (tlsPreflightClient) await tlsPreflightClient.end().catch(() => {});
      if (server) await new Promise((resolve) => server.close(resolve));
      if (profiles.length) await prisma.profile.deleteMany({ where: { id: { in: profiles.map(({ id }) => id) } } });
      if (users.length) await prisma.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
      if (company) await prisma.company.delete({ where: { id: company.id } });
      bucket.file = originalBucketFile;
      Object.defineProperty(bucket, "name", { configurable: true, value: originalBucketName });
      await prisma.$disconnect();
    }
  },
);
