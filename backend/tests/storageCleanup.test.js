import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  createStorageCleanupCandidate,
  clearProfilePdfAndQueueCleanup,
  deleteAdminProfileWithCleanup,
  enqueueStorageCleanupObjects,
  persistProfileAssetReplacement,
  processStorageCleanupJobs,
  uploadAndReplaceProfileImage,
} from "../src/services/storageCleanup.js";

const bucketName = "linkbase-test-bucket";

function urlFor(objectName) {
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

function makeProfile(overrides = {}) {
  return {
    id: "profile-test-id",
    publicId: "LBTEST4B",
    fullName: "Synthetic Storage Fixture",
    userId: "customer-test-id",
    photoUrl: null,
    logoUrl: null,
    pdfUrl: null,
    pdfDisplayName: null,
    ...overrides,
  };
}

function createDatabase({ profile = null, otherProfiles = [], events = [] } = {}) {
  const state = { profile: profile && { ...profile }, otherProfiles: otherProfiles.map((item) => ({ ...item })), jobs: [] };
  const clone = (value) => value && structuredClone(value);
  const matches = (job, where = {}) => {
    if (where.id && job.id !== where.id) return false;
    if (where.bucketName && job.bucketName !== where.bucketName) return false;
    if (typeof where.objectName === "string" && job.objectName !== where.objectName) return false;
    if (where.objectName?.in && !where.objectName.in.includes(job.objectName)) return false;
    if (where.availableAt?.lte && job.availableAt > where.availableAt.lte) return false;
    if (where.lockedUntil instanceof Date && job.lockedUntil?.getTime() !== where.lockedUntil.getTime()) return false;
    if (where.OR && !where.OR.some((condition) =>
      (condition.lockedUntil === null && job.lockedUntil === null) ||
      (condition.lockedUntil?.lte && job.lockedUntil && job.lockedUntil <= condition.lockedUntil.lte))) return false;
    return true;
  };

  const database = {
    state,
    async $transaction(work) { return work(database); },
    async $queryRaw(_query, publicId) {
      const found = [state.profile, ...state.otherProfiles].find((item) => item?.publicId === publicId);
      return found ? [{
        id: found.id,
        publicId: found.publicId,
        photoUrl: found.photoUrl,
        logoUrl: found.logoUrl,
        pdfUrl: found.pdfUrl,
      }] : [];
    },
    profile: {
      async findUnique({ where }) {
        const found = [state.profile, ...state.otherProfiles].find((item) =>
          item && (item.id === where.id || item.publicId === where.publicId));
        return clone(found || null);
      },
      async updateMany({ where, data }) {
        const found = state.profile;
        if (!found || found.publicId !== where.publicId) return { count: 0 };
        for (const [key, expected] of Object.entries(where)) {
          if (key === "publicId") continue;
          if (found[key] !== expected) return { count: 0 };
        }
        Object.assign(found, data);
        events.push({ action: "profile-persisted", field: Object.keys(data)[0] });
        return { count: 1 };
      },
      async delete({ where }) {
        if (!state.profile || state.profile.id !== where.id) throw new Error("profile missing");
        state.profile = null;
      },
      async findFirst({ where }) {
        const urls = new Set((where.OR || []).map((condition) => Object.values(condition)[0]));
        const found = [state.profile, ...state.otherProfiles].find((item) =>
          item && [item.photoUrl, item.logoUrl, item.pdfUrl].some((value) => value && urls.has(value)));
        return found ? { id: found.id } : null;
      },
    },
    storageCleanupJob: {
      async create({ data }) {
        if (state.jobs.some((job) => job.bucketName === data.bucketName && job.objectName === data.objectName)) {
          throw new Error("duplicate cleanup candidate");
        }
        const job = { id: randomUUID(), attempts: 0, lockedUntil: null, lastError: null, ...clone(data) };
        state.jobs.push(job);
        return clone(job);
      },
      async createMany({ data }) {
        let count = 0;
        for (const item of data) {
          if (state.jobs.some((job) => job.bucketName === item.bucketName && job.objectName === item.objectName)) continue;
          state.jobs.push({ id: randomUUID(), attempts: 0, lockedUntil: null, lastError: null, ...clone(item) });
          count += 1;
        }
        return { count };
      },
      async findMany({ where, take }) {
        return state.jobs.filter((job) => matches(job, where))
          .sort((a, b) => a.availableAt - b.availableAt)
          .slice(0, take)
          .map(clone);
      },
      async updateMany({ where, data }) {
        const found = state.jobs.filter((job) => matches(job, where));
        for (const job of found) Object.assign(job, clone(data));
        return { count: found.length };
      },
      async deleteMany({ where }) {
        const before = state.jobs.length;
        state.jobs = state.jobs.filter((job) => !matches(job, where));
        return { count: before - state.jobs.length };
      },
    },
  };
  return database;
}

function mockBucket({ events = [], failDelete = () => false, save = async () => {} } = {}) {
  const stored = new Set();
  return {
    name: bucketName,
    stored,
    file(objectName) {
      return {
        async save(buffer, options) {
          events.push({ action: "save", objectName, options });
          stored.add(objectName);
          await save(objectName, buffer);
        },
        async delete(options) {
          events.push({ action: "delete", objectName, options });
          if (failDelete(objectName)) {
            const error = new Error("synthetic storage failure");
            error.code = 503;
            throw error;
          }
          stored.delete(objectName);
        },
      };
    },
  };
}

test("profile deletion queues photo, logo and PDF cleanup and preserves unrelated records", async () => {
  const photo = `profiles/LBTEST4B/${randomUUID()}.webp`;
  const logo = `profiles/LBTEST4B/logos/${randomUUID()}.png`;
  const pdf = `profiles/profile-test-id/pdf/${randomUUID()}.pdf`;
  const database = createDatabase({ profile: makeProfile({ photoUrl: urlFor(photo), logoUrl: urlFor(logo), pdfUrl: urlFor(pdf) }) });
  const events = [];
  const bucket = mockBucket({ events });
  [photo, logo, pdf].forEach((objectName) => bucket.stored.add(objectName));

  const deletion = await deleteAdminProfileWithCleanup(database, bucketName, "LBTEST4B");
  assert.ok(deletion);
  assert.equal(database.state.profile, null);
  assert.deepEqual(database.state.jobs.map(({ objectName }) => objectName).sort(), [photo, logo, pdf].sort());

  const result = await processStorageCleanupJobs({ database, bucket });
  assert.equal(result.cleaned, 3);
  assert.deepEqual(events.filter(({ action }) => action === "delete").map(({ objectName }) => objectName).sort(), [photo, logo, pdf].sort());
  assert.equal(database.state.jobs.length, 0);
});

test("image replacement persists the new URL before cleaning the obsolete object", async () => {
  const oldObject = `profiles/LBTEST4B/${randomUUID()}.jpg`;
  const profile = makeProfile({ photoUrl: urlFor(oldObject) });
  const events = [];
  const database = createDatabase({ profile, events });
  const bucket = mockBucket({ events });
  bucket.stored.add(oldObject);
  const saved = await uploadAndReplaceProfileImage({
    database,
    bucket,
    profile,
    publicId: profile.publicId,
    imageField: "photoUrl",
    buffer: Buffer.from("synthetic image"),
    mimetype: "image/png",
  });

  assert.equal(saved.photoUrl, database.state.profile.photoUrl);
  assert.notEqual(saved.photoUrl, urlFor(oldObject));
  const databasePersistedAt = events.findIndex(({ action }) => action === "profile-persisted");
  const oldDeleteAt = events.findIndex(({ action, objectName }) => action === "delete" && objectName === oldObject);
  assert.ok(databasePersistedAt >= 0 && oldDeleteAt > databasePersistedAt);
  assert.equal(bucket.stored.has(oldObject), false);
});

test("failed image persistence triggers cleanup of the newly uploaded object", async () => {
  const profile = makeProfile();
  const database = createDatabase({ profile });
  const originalUpdate = database.profile.updateMany;
  database.profile.updateMany = async () => { throw new Error("synthetic database failure"); };
  const events = [];
  const bucket = mockBucket({ events });

  await assert.rejects(uploadAndReplaceProfileImage({
    database,
    bucket,
    profile,
    publicId: profile.publicId,
    imageField: "photoUrl",
    buffer: Buffer.from("synthetic image"),
    mimetype: "image/png",
  }), /synthetic database failure/);

  const uploaded = events.find(({ action }) => action === "save");
  assert.ok(uploaded);
  assert.ok(events.some(({ action, objectName }) => action === "delete" && objectName === uploaded.objectName));
  assert.equal(bucket.stored.has(uploaded.objectName), false);
  assert.equal(database.state.profile.photoUrl, null);
  assert.equal(database.state.jobs.length, 0);
  database.profile.updateMany = originalUpdate;
});

test("failed GCS deletion remains observable and can be retried idempotently", async () => {
  const objectName = `profiles/LBTEST4B/${randomUUID()}.webp`;
  const database = createDatabase();
  await createStorageCleanupCandidate(database, bucketName, objectName);
  await database.storageCleanupJob.updateMany({ where: { bucketName, objectName }, data: { availableAt: new Date(0) } });
  let failuresRemaining = 1;
  const bucket = mockBucket({ failDelete: () => failuresRemaining-- > 0 });
  bucket.stored.add(objectName);

  const failed = await processStorageCleanupJobs({ database, bucket });
  assert.equal(failed.failed, 1);
  assert.equal(database.state.jobs[0].attempts, 1);
  assert.equal(database.state.jobs[0].lastError, "GCS_503");
  assert.equal(bucket.stored.has(objectName), true);

  await database.storageCleanupJob.updateMany({ where: { bucketName, objectName }, data: { availableAt: new Date(0) } });
  const retried = await processStorageCleanupJobs({ database, bucket });
  assert.equal(retried.cleaned, 1);
  assert.equal(bucket.stored.has(objectName), false);
  assert.equal(database.state.jobs.length, 0);
});

test("cleanup safely retries after GCS deletion succeeds but the job acknowledgement fails", async () => {
  const objectName = `profiles/LBTEST4B/logos/${randomUUID()}.png`;
  const database = createDatabase();
  await createStorageCleanupCandidate(database, bucketName, objectName);
  await database.storageCleanupJob.updateMany({ where: { bucketName, objectName }, data: { availableAt: new Date(0) } });
  const events = [];
  const bucket = mockBucket({ events });
  bucket.stored.add(objectName);
  const deleteJob = database.storageCleanupJob.deleteMany;
  let failAcknowledgement = true;
  database.storageCleanupJob.deleteMany = async (args) => {
    if (failAcknowledgement) {
      failAcknowledgement = false;
      throw new Error("synthetic database acknowledgement failure");
    }
    return deleteJob(args);
  };

  const firstAttempt = await processStorageCleanupJobs({ database, bucket });
  assert.equal(firstAttempt.failed, 1);
  assert.equal(bucket.stored.has(objectName), false);
  assert.equal(database.state.jobs[0].lastError, "JOB_ACK_FAILED");

  await database.storageCleanupJob.updateMany({ where: { bucketName, objectName }, data: { availableAt: new Date(0) } });
  const retry = await processStorageCleanupJobs({ database, bucket });
  assert.equal(retry.cleaned, 1);
  assert.equal(events.filter(({ action }) => action === "delete").length, 2);
  assert.ok(events.every(({ action, options }) => action !== "delete" || options.ignoreNotFound === true));
  assert.equal(database.state.jobs.length, 0);
});

test("cleanup never removes an object referenced by another profile", async () => {
  const objectName = `profiles/LBTEST4B/logos/${randomUUID()}.png`;
  const database = createDatabase({ otherProfiles: [makeProfile({ id: "another-profile", publicId: "LBOTHER", logoUrl: urlFor(objectName) })] });
  await enqueueStorageCleanupObjects(database, [{ bucketName, objectName }]);
  const events = [];
  const bucket = mockBucket({ events });
  bucket.stored.add(objectName);

  const result = await processStorageCleanupJobs({ database, bucket });
  assert.equal(result.deferred, 1);
  assert.equal(events.some(({ action }) => action === "delete"), false);
  assert.equal(bucket.stored.has(objectName), true);
  assert.equal(database.state.jobs[0].lastError, "OBJECT_STILL_REFERENCED");
});

test("replacement racing with profile deletion cannot delete a referenced or newly persisted object", async () => {
  const oldObject = `profiles/LBTEST4B/${randomUUID()}.webp`;
  const profile = makeProfile({ photoUrl: urlFor(oldObject) });
  const database = createDatabase({ profile });
  const events = [];
  let releaseSave;
  let markSaveStarted;
  const saveStarted = new Promise((resolve) => { markSaveStarted = resolve; });
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  const bucket = mockBucket({ events, save: async () => { markSaveStarted(); await saveGate; } });
  bucket.stored.add(oldObject);

  const replacement = uploadAndReplaceProfileImage({
    database,
    bucket,
    profile,
    publicId: profile.publicId,
    imageField: "photoUrl",
    buffer: Buffer.from("synthetic image"),
    mimetype: "image/png",
  });
  await saveStarted;
  const deletion = await deleteAdminProfileWithCleanup(database, bucketName, profile.publicId);
  assert.ok(deletion);
  await processStorageCleanupJobs({ database, bucket, objectNames: deletion.objects.map(({ objectName }) => objectName) });
  releaseSave();
  await assert.rejects(replacement, (error) => error.code === "PROFILE_MEDIA_CONFLICT");

  assert.equal(database.state.profile, null);
  assert.equal(bucket.stored.size, 0);
  assert.equal(database.state.jobs.length, 0);
  assert.ok(events.some(({ action, objectName }) => action === "delete" && objectName === oldObject));
});

test("asset persistence and cleanup enqueue are one database transaction", async () => {
  const database = createDatabase({ profile: makeProfile() });
  const objectName = `profiles/LBTEST4B/${randomUUID()}.png`;
  await createStorageCleanupCandidate(database, bucketName, objectName);
  const transactionCalls = [];
  const original = database.$transaction;
  database.$transaction = async (work) => {
    transactionCalls.push("begin");
    const result = await original(work);
    transactionCalls.push("commit");
    return result;
  };
  const saved = await persistProfileAssetReplacement({
    database,
    bucketName,
    publicId: "LBTEST4B",
    profileId: "profile-test-id",
    expectedUserId: "customer-test-id",
    imageField: "photoUrl",
    expectedUrl: null,
    newUrl: urlFor(objectName),
    newObjectName: objectName,
  });
  assert.equal(saved.photoUrl, urlFor(objectName));
  assert.deepEqual(transactionCalls, ["begin", "commit"]);
  assert.equal(database.state.jobs.length, 0);
});

test("PDF replacement preserves conditional URL checks and atomically queues the previous object", async () => {
  const oldObject = `profiles/profile-test-id/pdf/${randomUUID()}.pdf`;
  const newObject = `profiles/profile-test-id/pdf/${randomUUID()}.pdf`;
  const profile = makeProfile({ pdfUrl: urlFor(oldObject), pdfDisplayName: "old.pdf" });
  const database = createDatabase({ profile });
  await createStorageCleanupCandidate(database, bucketName, newObject);

  const saved = await persistProfileAssetReplacement({
    database,
    bucketName,
    publicId: profile.publicId,
    profileId: profile.id,
    expectedUserId: profile.userId,
    imageField: "pdfUrl",
    expectedUrl: profile.pdfUrl,
    newUrl: urlFor(newObject),
    newObjectName: newObject,
    pdfDisplayName: "new.pdf",
  });

  assert.equal(saved.pdfUrl, urlFor(newObject));
  assert.equal(saved.pdfDisplayName, "new.pdf");
  assert.deepEqual(database.state.jobs.map(({ objectName }) => objectName), [oldObject]);
});

test("PDF removal clears only the previously read owner/URL and queues storage cleanup atomically", async () => {
  const oldObject = `profiles/profile-test-id/pdf/${randomUUID()}.pdf`;
  const profile = makeProfile({ pdfUrl: urlFor(oldObject), pdfDisplayName: "old.pdf" });
  const database = createDatabase({ profile });
  const cleared = await clearProfilePdfAndQueueCleanup({
    database,
    bucketName,
    publicId: profile.publicId,
    profileId: profile.id,
    expectedUserId: profile.userId,
    expectedUrl: profile.pdfUrl,
  });
  assert.equal(cleared, true);
  assert.equal(database.state.profile.pdfUrl, null);
  assert.deepEqual(database.state.jobs.map(({ objectName }) => objectName), [oldObject]);

  const stale = await clearProfilePdfAndQueueCleanup({
    database,
    bucketName,
    publicId: profile.publicId,
    profileId: profile.id,
    expectedUserId: profile.userId,
    expectedUrl: urlFor(oldObject),
  });
  assert.equal(stale, false);
  assert.equal(database.state.jobs.length, 1);
});
