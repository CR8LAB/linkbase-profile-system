import prisma from "../config/prisma.js";
import { bucket } from "../config/storage.js";
import { createCustomerAccountDeletionHandler } from "../services/customerAccountDeletion.js";
import {
  deleteAdminProfileWithCleanup,
  processStorageCleanupJobs,
} from "../services/storageCleanup.js";

export const deleteAdminCustomer = createCustomerAccountDeletionHandler({
  transaction: (work) => prisma.$transaction(work),
});

export async function getAdminSummary(req, res) {
  try {
    const [totalProfiles, companies, customers, unassignedProfiles] =
      await Promise.all([
        prisma.profile.count(),
        prisma.company.count(),
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.profile.count({ where: { userId: null } }),
      ]);

    return res.status(200).json({
      success: true,
      summary: { totalProfiles, companies, customers, unassignedProfiles },
    });
  } catch (error) {
    console.error("Admin summary failed:", error);
    return res.status(500).json({ message: "Failed to load dashboard data" });
  }
}

export async function getCustomers(req, res) {
  try {
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        profiles: {
          select: { publicId: true, fullName: true },
        },
      },
    });

    return res.status(200).json({ success: true, customers });
  } catch (error) {
    console.error("Customer list failed:", error);
    return res.status(500).json({ message: "Failed to load customers" });
  }
}

export async function getAdminProfiles(req, res) {
  try {
    const profiles = await prisma.profile.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        company: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    return res.status(200).json({ success: true, profiles });
  } catch (error) {
    console.error("Admin profile list failed:", error);
    return res.status(500).json({ message: "Failed to load profiles" });
  }
}

export async function deleteAdminProfile(req, res) {
  const { publicId } = req.params;

  try {
    const deletion = await deleteAdminProfileWithCleanup(prisma, bucket.name, publicId);
    if (!deletion) {
      return res.status(404).json({ message: "Profile not found" });
    }

    const cleanup = await processStorageCleanupJobs({
      database: prisma,
      bucket,
      objectNames: deletion.objects.map(({ objectName }) => objectName),
    }).catch((error) => {
      console.error("Queued profile cleanup could not run:", error.code || "CLEANUP_PROCESS_FAILED");
      return { cleaned: 0, deferred: 0, failed: deletion.objects.length };
    });

    return res.status(200).json({
      success: true,
      message: cleanup.cleaned < deletion.objects.length || cleanup.failed || cleanup.deferred
        ? "Profile deleted. Some storage cleanup is queued for retry."
        : "Profile deleted successfully",
      cleanup: {
        queued: deletion.objects.length,
        attempted: cleanup.claimed,
        cleaned: cleanup.cleaned,
        deferred: cleanup.deferred,
        failed: cleanup.failed,
      },
    });
  } catch (error) {
    console.error("Admin profile deletion failed:", error.code || "PROFILE_DELETE_FAILED");
    return res.status(500).json({
      message: "Could not fully delete the profile. Please retry or contact support.",
    });
  }
}

export async function getAdminStorageCleanupJobs(req, res) {
  try {
    const jobs = await prisma.storageCleanupJob.findMany({
      where: { bucketName: bucket.name },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        objectName: true,
        attempts: true,
        availableAt: true,
        lastError: true,
        createdAt: true,
      },
    });
    return res.status(200).json({ success: true, jobs });
  } catch (error) {
    console.error("Storage cleanup status lookup failed:", error.code || "DATABASE_ERROR");
    return res.status(500).json({ message: "Could not load storage cleanup status" });
  }
}

export async function retryAdminStorageCleanupJob(req, res) {
  try {
    const job = await prisma.storageCleanupJob.findFirst({
      where: { id: req.params.jobId, bucketName: bucket.name },
      select: { id: true },
    });
    if (!job) {
      return res.status(404).json({ message: "Storage cleanup job not found" });
    }

    const now = new Date();
    const released = await prisma.storageCleanupJob.updateMany({
      where: {
        id: req.params.jobId,
        bucketName: bucket.name,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
      data: { availableAt: new Date(), lockedUntil: null, lastError: null },
    });
    if (released.count !== 1) {
      return res.status(202).json({
        success: true,
        cleaned: false,
        message: "Storage cleanup is already in progress",
      });
    }

    await processStorageCleanupJobs({ database: prisma, bucket, jobId: req.params.jobId });
    const pending = await prisma.storageCleanupJob.findFirst({
      where: { id: req.params.jobId, bucketName: bucket.name },
      select: { id: true, attempts: true, availableAt: true, lastError: true },
    });
    if (!pending) {
      return res.status(200).json({ success: true, cleaned: true });
    }
    return res.status(202).json({
      success: true,
      cleaned: false,
      message: "Storage cleanup remains queued for retry",
      job: pending,
    });
  } catch (error) {
    console.error("Storage cleanup retry failed:", error.code || "CLEANUP_RETRY_FAILED");
    return res.status(500).json({ message: "Could not retry storage cleanup" });
  }
}
