import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { validateTestDatabaseUrl } from "./databaseIntegrityGuard.js";
import { verifyPostgresClientTls } from "./databaseIntegrityTls.js";
import {
  createStorageCleanupCandidate,
  deleteAdminProfileWithCleanup,
  enqueueStorageCleanupObjects,
  persistProfileAssetReplacement,
  processStorageCleanupJobs,
} from "../src/services/storageCleanup.js";

const outboxMigration = "20261114150000_add_storage_cleanup_jobs";
const phase4aMigrations = [
  "20261029011529_init",
  "20261103000000_mvp_foundation",
  "20261105000000_add_body_text_color",
  "20261105120000_add_profile_short_code",
  "20261107000000_add_save_contact_button_colors",
  "20261107110000_add_social_link_colors",
  "20261108120000_add_profile_visit_events",
  "20261112120000_add_profile_pdf_display_name",
  "20261113120000_add_user_token_version",
];
const requiredOutboxColumns = [
  "id",
  "bucketName",
  "objectName",
  "attempts",
  "availableAt",
  "lockedUntil",
  "lastError",
  "createdAt",
  "updatedAt",
];
const testDatabaseUrl = validateTestDatabaseUrl(process.env.LINKBASE_TEST_DATABASE_URL);

function createPrismaClient(connectionString) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

function makeMockBucket(name) {
  const deleteCalls = [];
  let deleteBehavior = async () => {};
  return {
    name,
    deleteCalls,
    setDeleteBehavior(behavior) { deleteBehavior = behavior; },
    file(objectName) {
      return {
        async delete(options) {
          deleteCalls.push({ objectName, options });
          await deleteBehavior(objectName, options);
        },
      };
    },
  };
}

test(
  "Phase 4B PostgreSQL outbox integrity and worker concurrency",
  { skip: testDatabaseUrl ? false : "Set LINKBASE_TEST_DATABASE_URL to the guarded dedicated Neon test branch" },
  async (t) => {
    let tlsClient = new Client({
      connectionString: testDatabaseUrl.href,
      connectionTimeoutMillis: 12000,
    });
    let prisma;
    let company;
    let customer;
    const profiles = [];
    const jobIds = new Set();
    const suffix = randomUUID().replaceAll("-", "");
    const bucket = makeMockBucket("linkbase-phase4a-test");

    try {
      await tlsClient.connect();
      const tls = verifyPostgresClientTls(tlsClient);
      const identity = await tlsClient.query(
        "SELECT current_database() AS database_name, current_schema() AS schema_name",
      );
      // validateTestDatabaseUrl enforces the exact Neon hostname allowlist,
      // required database name, and mandatory SSL mode for this test target.
      assert.equal(decodeURIComponent(testDatabaseUrl.pathname.slice(1)), "neondb");
      assert.equal(identity.rows[0]?.database_name, "neondb");
      assert.equal(identity.rows[0]?.schema_name, "public");
      assert.equal(tls.encrypted, true);
      assert.equal(tls.certificateAuthorized, true);

      const migrationRows = await tlsClient.query(
        'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
      );
      const migrationByName = new Map(migrationRows.rows.map((row) => [row.migration_name, row]));
      assert.ok(
        migrationRows.rows.every((row) => row.finished_at && !row.rolled_back_at),
        "The dedicated test branch must not contain failed or rolled-back migrations",
      );
      for (const migrationName of phase4aMigrations) {
        const row = migrationByName.get(migrationName);
        assert.ok(row?.finished_at && !row.rolled_back_at, "Phase 4A migration history must be clean before this suite");
      }
      const pendingOutboxHistory = migrationByName.get(outboxMigration);
      assert.ok(
        !pendingOutboxHistory || (pendingOutboxHistory.finished_at && !pendingOutboxHistory.rolled_back_at),
        "The outbox migration must not be failed or rolled back",
      );

      const tableCheck = await tlsClient.query(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'StorageCleanupJob') AS present",
      );
      const outboxTablePresent = tableCheck.rows[0]?.present === true;
      assert.equal(outboxTablePresent, Boolean(pendingOutboxHistory?.finished_at));
      if (!outboxTablePresent) {
        await t.test("read-only Neon host, TLS, database and Phase 4A migration preflight passed", () => {
          assert.equal(tls.encrypted, true);
          assert.equal(tls.certificateAuthorized, true);
          assert.equal(identity.rows[0].database_name, "neondb");
        });
        await t.test("outbox creation, rollback, cleanup and worker cases require the un-applied Phase 4B migration", {
          skip: "StorageCleanupJob table is absent; no fixtures or writes were attempted",
        }, () => {});
        return;
      }

      const columnResult = await tlsClient.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'StorageCleanupJob'",
      );
      const actualColumns = new Set(columnResult.rows.map(({ column_name }) => column_name));
      assert.deepEqual(requiredOutboxColumns.filter((column) => !actualColumns.has(column)), []);
      await tlsClient.end();
      tlsClient = null;

      prisma = createPrismaClient(testDatabaseUrl.href);
      await prisma.$connect();
      company = await prisma.company.create({
        data: { name: `Phase 4B synthetic ${suffix}` },
      });
      customer = await prisma.user.create({
        data: {
          email: `phase4b-${suffix}@example.invalid`,
          passwordHash: "phase4b-synthetic-fixture-only",
          role: "CUSTOMER",
        },
      });
      let nextProfile = 0;
      const createProfile = async (data = {}) => {
        nextProfile += 1;
        const profile = await prisma.profile.create({
          data: {
            publicId: `P4B${suffix.slice(0, 12)}${nextProfile}`,
            shortCode: randomBytes(6).toString("hex"),
            fullName: `Phase 4B synthetic profile ${nextProfile}`,
            companyId: company.id,
            ...data,
          },
        });
        profiles.push(profile);
        return profile;
      };
      await t.test("outbox jobs persist after a simulated application restart", async () => {
        const objectName = `profiles/P4B${suffix.slice(0, 12)}1/${randomUUID()}.png`;
        const job = await createStorageCleanupCandidate(prisma, bucket.name, objectName);
        jobIds.add(job.id);
        await prisma.$disconnect();
        prisma = createPrismaClient(testDatabaseUrl.href);
        await prisma.$connect();
        const reloaded = await prisma.storageCleanupJob.findUnique({ where: { id: job.id } });
        assert.equal(reloaded.objectName, objectName);
        assert.equal(reloaded.bucketName, bucket.name);
        assert.equal(reloaded.attempts, 0);
      });

      await t.test("outbox job creation can be rolled back with its transaction", async () => {
        const objectName = `profiles/P4B${suffix.slice(0, 12)}2/${randomUUID()}.webp`;
        await assert.rejects(
          prisma.$transaction(async (transaction) => {
            await enqueueStorageCleanupObjects(transaction, [{ bucketName: bucket.name, objectName }]);
            throw new Error("phase4b synthetic rollback");
          }),
          /phase4b synthetic rollback/,
        );
        assert.equal(await prisma.storageCleanupJob.count({ where: { bucketName: bucket.name, objectName } }), 0);
      });

      await t.test("profile deletion atomically queues only its photo, logo and PDF objects", async () => {
        const profile = await createProfile({ userId: customer.id });
        const objects = [
          `profiles/${profile.publicId}/${randomUUID()}.webp`,
          `profiles/${profile.publicId}/logos/${randomUUID()}.png`,
          `profiles/${profile.id}/pdf/${randomUUID()}.pdf`,
        ];
        await prisma.profile.update({
          where: { id: profile.id },
          data: {
            photoUrl: `https://storage.googleapis.com/${bucket.name}/${objects[0]}`,
            logoUrl: `https://storage.googleapis.com/${bucket.name}/${objects[1]}`,
            pdfUrl: `https://storage.googleapis.com/${bucket.name}/${objects[2]}`,
            pdfDisplayName: "fixture.pdf",
          },
        });

        const result = await deleteAdminProfileWithCleanup(prisma, bucket.name, profile.publicId);
        assert.deepEqual(result.objects.map(({ objectName }) => objectName).sort(), [...objects].sort());
        assert.equal(await prisma.profile.findUnique({ where: { id: profile.id } }), null);
        const jobs = await prisma.storageCleanupJob.findMany({
          where: { bucketName: bucket.name, objectName: { in: objects } },
          select: { id: true, objectName: true },
        });
        assert.deepEqual(jobs.map(({ objectName }) => objectName).sort(), [...objects].sort());
        jobs.forEach(({ id }) => jobIds.add(id));
        assert.ok(await prisma.user.findUnique({ where: { id: customer.id } }));
        assert.ok(await prisma.company.findUnique({ where: { id: company.id } }));
      });

      await t.test("image replacement commits the new URL and queues the obsolete object", async () => {
        const profile = await createProfile({ userId: customer.id });
        const oldObject = `profiles/${profile.publicId}/${randomUUID()}.jpg`;
        const newObject = `profiles/${profile.publicId}/${randomUUID()}.webp`;
        const oldUrl = `https://storage.googleapis.com/${bucket.name}/${oldObject}`;
        const newUrl = `https://storage.googleapis.com/${bucket.name}/${newObject}`;
        await prisma.profile.update({ where: { id: profile.id }, data: { photoUrl: oldUrl } });
        profile.photoUrl = oldUrl;
        const candidate = await createStorageCleanupCandidate(prisma, bucket.name, newObject);
        jobIds.add(candidate.id);

        const saved = await persistProfileAssetReplacement({
          database: prisma,
          bucketName: bucket.name,
          publicId: profile.publicId,
          profileId: profile.id,
          expectedUserId: customer.id,
          imageField: "photoUrl",
          expectedUrl: profile.photoUrl,
          newUrl,
          newObjectName: newObject,
        });
        assert.equal(saved.photoUrl, newUrl);
        assert.equal(await prisma.storageCleanupJob.findUnique({ where: { id: candidate.id } }), null);
        const persistedProfile = await prisma.profile.findUnique({ where: { id: profile.id }, select: { photoUrl: true } });
        assert.equal(persistedProfile.photoUrl, newUrl);
        const oldJob = await prisma.storageCleanupJob.findFirst({
          where: { bucketName: bucket.name, objectName: oldObject },
        });
        assert.ok(oldJob);
        jobIds.add(oldJob.id);
      });

      await t.test("referenced objects remain queued and are never passed to GCS delete", async () => {
        const profile = await createProfile();
        const objectName = `profiles/${profile.publicId}/logos/${randomUUID()}.png`;
        const objectUrl = `https://storage.googleapis.com/${bucket.name}/${objectName}`;
        await prisma.profile.update({ where: { id: profile.id }, data: { logoUrl: objectUrl } });
        const job = await createStorageCleanupCandidate(prisma, bucket.name, objectName);
        jobIds.add(job.id);
        await prisma.storageCleanupJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });

        const before = bucket.deleteCalls.length;
        const summary = await processStorageCleanupJobs({ database: prisma, bucket, jobId: job.id });
        assert.equal(summary.deferred, 1);
        assert.equal(bucket.deleteCalls.length, before);
        const pending = await prisma.storageCleanupJob.findUnique({ where: { id: job.id } });
        assert.equal(pending.lastError, "OBJECT_STILL_REFERENCED");
      });

      await t.test("failed storage deletion remains retryable", async () => {
        const objectName = `profiles/P4B${suffix.slice(0, 12)}4/${randomUUID()}.webp`;
        const job = await createStorageCleanupCandidate(prisma, bucket.name, objectName);
        jobIds.add(job.id);
        await prisma.storageCleanupJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
        let failuresRemaining = 1;
        bucket.setDeleteBehavior(async () => {
          if (failuresRemaining-- > 0) {
            const error = new Error("synthetic GCS failure");
            error.code = 503;
            throw error;
          }
        });

        const first = await processStorageCleanupJobs({ database: prisma, bucket, jobId: job.id });
        assert.equal(first.failed, 1);
        const failedJob = await prisma.storageCleanupJob.findUnique({ where: { id: job.id } });
        assert.equal(failedJob.attempts, 1);
        assert.equal(failedJob.lastError, "GCS_503");
        await prisma.storageCleanupJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
        const retry = await processStorageCleanupJobs({ database: prisma, bucket, jobId: job.id });
        assert.equal(retry.cleaned, 1);
        assert.equal(await prisma.storageCleanupJob.findUnique({ where: { id: job.id } }), null);
      });

      await t.test("concurrent workers claim and delete one job only once", async () => {
        const objectName = `profiles/P4B${suffix.slice(0, 12)}5/${randomUUID()}.png`;
        const job = await createStorageCleanupCandidate(prisma, bucket.name, objectName);
        jobIds.add(job.id);
        await prisma.storageCleanupJob.update({ where: { id: job.id }, data: { availableAt: new Date(0) } });
        let markDeleteStarted;
        let releaseDelete;
        const deleteStarted = new Promise((resolve) => { markDeleteStarted = resolve; });
        const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
        bucket.setDeleteBehavior(async () => {
          markDeleteStarted();
          await deleteGate;
        });

        const firstWorker = processStorageCleanupJobs({ database: prisma, bucket, jobId: job.id });
        await deleteStarted;
        const secondWorkerPrisma = createPrismaClient(testDatabaseUrl.href);
        await secondWorkerPrisma.$connect();
        let secondWorker;
        try {
          secondWorker = await processStorageCleanupJobs({
            database: secondWorkerPrisma,
            bucket,
            jobId: job.id,
          });
        } finally {
          await secondWorkerPrisma.$disconnect();
        }
        assert.equal(secondWorker.claimed, 0);
        releaseDelete();
        const firstResult = await firstWorker;
        assert.equal(firstResult.cleaned, 1);
        assert.equal(bucket.deleteCalls.filter(({ objectName: deleted }) => deleted === objectName).length, 1);
        assert.equal(await prisma.storageCleanupJob.findUnique({ where: { id: job.id } }), null);
      });
    } finally {
      if (tlsClient) await tlsClient.end().catch(() => {});
      if (prisma) {
        if (jobIds.size) {
          await prisma.storageCleanupJob.deleteMany({ where: { id: { in: [...jobIds] } } }).catch(() => {});
        }
        if (profiles.length) {
          await prisma.profile.deleteMany({ where: { id: { in: profiles.map(({ id }) => id) } } }).catch(() => {});
        }
        if (customer) await prisma.user.deleteMany({ where: { id: customer.id } }).catch(() => {});
        if (company) await prisma.company.delete({ where: { id: company.id } }).catch(() => {});
        await prisma.$disconnect().catch(() => {});
      }
    }
  },
);
