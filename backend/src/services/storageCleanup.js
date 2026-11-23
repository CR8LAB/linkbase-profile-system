import { randomUUID } from "node:crypto";
import {
  getProfileBackgroundObjectName,
  getProfileLogoObjectName,
  getProfileMediaObjects,
  getProfilePdfObjectName,
  getProfilePhotoObjectName,
  getStorageObjectUrl,
  isGeneratedProfileObjectName,
} from "./storageObjects.js";
import { clearProfilePdfIfUnchanged } from "./profilePdf.js";
import { lockProfileScope } from "./profileAccess.js";

const CANDIDATE_GRACE_MS = 60 * 60 * 1000;
const LOCK_LEASE_MS = 2 * 60 * 1000;
const MAX_RETRY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH_SIZE = 25;

export {
  getProfileBackgroundObjectName,
  getProfileLogoObjectName,
  getProfileMediaObjects,
  getProfilePdfObjectName,
  getProfilePhotoObjectName,
};

function assertSafeObject(bucketName, objectName) {
  if (
    typeof bucketName !== "string" ||
    !bucketName ||
    typeof objectName !== "string" ||
    !isGeneratedProfileObjectName(objectName)
  ) {
    throw new Error("Refusing unsafe profile storage cleanup object");
  }
}

export async function createStorageCleanupCandidate(
  database,
  bucketName,
  objectName,
) {
  assertSafeObject(bucketName, objectName);
  return database.storageCleanupJob.create({
    data: {
      bucketName,
      objectName,
      availableAt: new Date(Date.now() + CANDIDATE_GRACE_MS),
    },
  });
}

export async function activateStorageCleanupCandidate(
  database,
  bucketName,
  objectName,
) {
  assertSafeObject(bucketName, objectName);
  return database.storageCleanupJob.updateMany({
    where: { bucketName, objectName },
    data: { availableAt: new Date(), lockedUntil: null },
  });
}

export async function enqueueStorageCleanupObjects(
  transaction,
  objects,
  availableAt = new Date(),
) {
  const unique = new Map();
  for (const { bucketName, objectName } of objects) {
    assertSafeObject(bucketName, objectName);
    unique.set(`${bucketName}\0${objectName}`, { bucketName, objectName });
  }
  if (!unique.size) return { count: 0 };
  return transaction.storageCleanupJob.createMany({
    data: [...unique.values()].map((object) => ({ ...object, availableAt })),
    skipDuplicates: true,
  });
}

export function getProfileImageObjectName(imageUrl, bucketName, publicId, imageField) {
  if (imageField === "photoUrl") {
    return getProfilePhotoObjectName(imageUrl, bucketName, publicId);
  }
  if (imageField === "logoUrl") {
    return getProfileLogoObjectName(imageUrl, bucketName, publicId);
  }
  if (imageField === "backgroundImageUrl") {
    return getProfileBackgroundObjectName(imageUrl, bucketName, publicId);
  }
  return null;
}

export async function persistProfileAssetReplacement({
  database,
  bucketName,
  publicId,
  profileId,
  expectedUserId,
  accessWhere,
  imageField,
  expectedUrl,
  newUrl,
  newObjectName,
  pdfDisplayName,
}) {
  if (!["photoUrl", "logoUrl", "backgroundImageUrl", "pdfUrl"].includes(imageField)) {
    throw new Error("Unsupported profile asset field");
  }
  assertSafeObject(bucketName, newObjectName);

  return database.$transaction(async (transaction) => {
    if (accessWhere && Object.keys(accessWhere).length) await lockProfileScope(transaction, { publicId });
    const data = { [imageField]: newUrl };
    if (imageField === "pdfUrl") data.pdfDisplayName = pdfDisplayName;
    const saved = await transaction.profile.updateMany({
      where: { publicId, userId: expectedUserId, [imageField]: expectedUrl, ...(accessWhere && { AND: accessWhere }) },
      data,
    });
    if (saved.count !== 1) return null;

    const oldObjectName = imageField === "pdfUrl"
      ? getProfilePdfObjectName(expectedUrl, bucketName, profileId)
      : getProfileImageObjectName(expectedUrl, bucketName, publicId, imageField);
    if (oldObjectName && oldObjectName !== newObjectName) {
      await enqueueStorageCleanupObjects(transaction, [{ bucketName, objectName: oldObjectName }]);
    }

    await transaction.storageCleanupJob.deleteMany({
      where: { bucketName, objectName: newObjectName },
    });
    return transaction.profile.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        ...(imageField === "pdfUrl"
          ? { pdfUrl: true, pdfDisplayName: true }
          : { fullName: true, [imageField]: true }),
      },
    });
  });
}

export async function clearProfilePdfAndQueueCleanup({
  database,
  bucketName,
  publicId,
  profileId,
  expectedUserId,
  accessWhere,
  expectedUrl,
}) {
  return database.$transaction(async (transaction) => {
    if (accessWhere && Object.keys(accessWhere).length) await lockProfileScope(transaction, { publicId });
    const result = await clearProfilePdfIfUnchanged(
      transaction,
      publicId,
      expectedUrl,
      expectedUserId,
      accessWhere,
    );
    if (result.count !== 1) return false;

    const objectName = getProfilePdfObjectName(expectedUrl, bucketName, profileId);
    if (objectName) {
      await enqueueStorageCleanupObjects(transaction, [{ bucketName, objectName }]);
    }
    return true;
  });
}

export function createProfileAssetConflictError() {
  return Object.assign(new Error("Profile asset changed during the operation"), {
    code: "PROFILE_MEDIA_CONFLICT",
  });
}

async function releaseFailedCandidate(database, bucket, objectName) {
  try {
    await activateStorageCleanupCandidate(database, bucket.name, objectName);
  } catch (error) {
    console.error("Could not activate failed profile asset cleanup candidate:", error.code || "QUEUE_UPDATE_FAILED");
    return;
  }
  try {
    await processStorageCleanupJobs({ database, bucket, objectNames: [objectName] });
  } catch (error) {
    console.error("Could not process failed profile asset cleanup candidate:", error.code || "CLEANUP_PROCESS_FAILED");
  }
}

export async function uploadAndReplaceProfileImage({
  database,
  bucket,
  profile,
  publicId,
  imageField,
  accessWhere,
  buffer,
  mimetype,
}) {
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const extension = extensions[mimetype];
  if (!extension || !["photoUrl", "logoUrl", "backgroundImageUrl"].includes(imageField)) {
    throw new Error("Unsupported profile image upload");
  }

  const objectName = imageField === "photoUrl"
    ? `profiles/${publicId}/${randomUUID()}.${extension}`
    : imageField === "logoUrl"
      ? `profiles/${publicId}/logos/${randomUUID()}.${extension}`
      : `profiles/${publicId}/background/${randomUUID()}.${extension}`;
  await createStorageCleanupCandidate(database, bucket.name, objectName);

  try {
    await bucket.file(objectName).save(buffer, {
      resumable: false,
      metadata: {
        contentType: mimetype,
        cacheControl: "public, max-age=31536000",
      },
    });
  } catch (error) {
    await releaseFailedCandidate(database, bucket, objectName);
    throw error;
  }

  const newUrl = getStorageObjectUrl(bucket.name, objectName);
  try {
    const saved = await persistProfileAssetReplacement({
      database,
      bucketName: bucket.name,
      publicId,
      profileId: profile.id,
      expectedUserId: profile.userId,
      accessWhere,
      imageField,
      expectedUrl: profile[imageField],
      newUrl,
      newObjectName: objectName,
    });
    if (!saved) throw createProfileAssetConflictError();
    await processStorageCleanupJobs({ database, bucket }).catch((error) => {
      console.error("Queued image cleanup could not run:", error.code || "CLEANUP_PROCESS_FAILED");
    });
    return saved;
  } catch (error) {
    await releaseFailedCandidate(database, bucket, objectName);
    throw error;
  }
}

export async function deleteAdminProfileWithCleanup(database, bucketName, publicId) {
  return database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw`
      SELECT "id", "publicId", "photoUrl", "logoUrl", "backgroundImageUrl", "pdfUrl"
      FROM "Profile"
      WHERE "publicId" = ${publicId}
      FOR UPDATE
    `;
    const profile = rows[0] || null;
    if (!profile) return null;

    const objects = getProfileMediaObjects(profile, bucketName);
    await transaction.profile.delete({ where: { id: profile.id } });
    await enqueueStorageCleanupObjects(transaction, objects);
    return { profile, objects };
  });
}

function safeFailureCode(error) {
  if (Number.isInteger(error?.code)) return `GCS_${error.code}`;
  if (typeof error?.code === "string" && /^[a-z0-9_-]{1,32}$/i.test(error.code)) {
    return `GCS_${error.code}`;
  }
  return "GCS_DELETE_FAILED";
}

function retryDelay(attempt) {
  return Math.min(60_000 * (2 ** Math.min(attempt - 1, 10)), MAX_RETRY_MS);
}

export async function processStorageCleanupJobs({
  database,
  bucket,
  jobId,
  objectNames,
  limit = CLEANUP_BATCH_SIZE,
}) {
  const now = new Date();
  const eligibility = {
    bucketName: bucket.name,
    availableAt: { lte: now },
    OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
  };
  if (jobId) eligibility.id = jobId;
  if (objectNames) eligibility.objectName = { in: objectNames };
  const jobs = await database.storageCleanupJob.findMany({
    where: eligibility,
    orderBy: { availableAt: "asc" },
    take: limit,
    select: { id: true, bucketName: true, objectName: true, attempts: true },
  });

  const summary = { cleaned: 0, deferred: 0, failed: 0, claimed: 0 };
  for (const job of jobs) {
    if (job.bucketName !== bucket.name || !isGeneratedProfileObjectName(job.objectName)) {
      await database.storageCleanupJob.updateMany({
        where: { id: job.id },
        data: {
          attempts: job.attempts + 1,
          availableAt: new Date(Date.now() + MAX_RETRY_MS),
          lockedUntil: null,
          lastError: "UNSAFE_OBJECT_NAME",
        },
      });
      console.error("Skipped unsafe GCS cleanup job", { jobId: job.id });
      summary.failed += 1;
      continue;
    }

    const lockedUntil = new Date(Date.now() + LOCK_LEASE_MS);
    const claimed = await database.storageCleanupJob.updateMany({
      where: {
        id: job.id,
        bucketName: bucket.name,
        availableAt: { lte: now },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
      data: { lockedUntil },
    });
    if (claimed.count !== 1) continue;
    summary.claimed += 1;

    let failurePhase = "REFERENCE_CHECK_FAILED";
    try {
      const objectUrl = getStorageObjectUrl(bucket.name, job.objectName);
      const reference = await database.profile.findFirst({
        where: {
          OR: [
            { photoUrl: objectUrl },
            { logoUrl: objectUrl },
            { backgroundImageUrl: objectUrl },
            { pdfUrl: objectUrl },
          ],
        },
        select: { id: true },
      });
      if (reference) {
        await database.storageCleanupJob.updateMany({
          where: { id: job.id, lockedUntil },
          data: {
            availableAt: new Date(Date.now() + MAX_RETRY_MS),
            lockedUntil: null,
            lastError: "OBJECT_STILL_REFERENCED",
          },
        });
        summary.deferred += 1;
        continue;
      }

      failurePhase = "GCS_DELETE_FAILED";
      await bucket.file(job.objectName).delete({ ignoreNotFound: true });
      failurePhase = "JOB_ACK_FAILED";
      await database.storageCleanupJob.deleteMany({
        where: { id: job.id, lockedUntil },
      });
      summary.cleaned += 1;
    } catch (error) {
      const attempts = job.attempts + 1;
      const errorCode = failurePhase === "GCS_DELETE_FAILED"
        ? safeFailureCode(error)
        : failurePhase;
      await database.storageCleanupJob.updateMany({
        where: { id: job.id, lockedUntil },
        data: {
          attempts,
          availableAt: new Date(Date.now() + retryDelay(attempts)),
          lockedUntil: null,
          lastError: errorCode,
        },
      });
      console.error("Profile storage cleanup failed; retry scheduled", {
        jobId: job.id,
        objectName: job.objectName,
        attempts,
        errorCode,
      });
      summary.failed += 1;
    }
  }
  return summary;
}
