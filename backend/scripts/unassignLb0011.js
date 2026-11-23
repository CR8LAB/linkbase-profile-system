import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_ID = "LB0011";
const EXPECTED_OWNER_EMAIL = "testcustomer@example.com";
const USAGE = "Usage: node scripts/unassignLb0011.js [--dry-run | --apply <reviewed-profile-id>]";

class MaintenanceError extends Error {}

function findProfile(database) {
  return database.profile.findUnique({
    where: { publicId: PUBLIC_ID },
    select: {
      id: true,
      publicId: true,
      shortCode: true,
      fullName: true,
      email: true,
      companyId: true,
      userId: true,
      user: { select: { email: true, role: true } },
    },
  });
}

export async function unassignLb0011(database, { reviewedProfileId, log = console.log } = {}) {
  const profile = await findProfile(database);
  if (!profile) throw new MaintenanceError(`${PUBLIC_ID} was not found.`);
  const { userId, user } = profile;
  if (
    userId === null ||
    userId === undefined ||
    user?.email !== EXPECTED_OWNER_EMAIL ||
    user.role !== "CUSTOMER"
  ) {
    throw new MaintenanceError(`${PUBLIC_ID} is not owned by the expected test customer.`);
  }
  if (reviewedProfileId !== undefined && reviewedProfileId !== profile.id) {
    throw new MaintenanceError("The reviewed profile ID does not match this database. Run a fresh dry-run.");
  }

  const unusedInvitations = { profileId: profile.id, usedAt: null };
  const [outstandingCount, unusedCount] = await Promise.all([
    database.profileClaimToken.count({ where: { ...unusedInvitations, expiresAt: { gt: new Date() } } }),
    database.profileClaimToken.count({ where: unusedInvitations }),
  ]);
  log(reviewedProfileId === undefined ? "Dry run" : "Apply preflight", {
    profileId: profile.id,
    publicId: profile.publicId,
    fullName: profile.fullName,
    shortCode: profile.shortCode,
    currentOwner: user.email,
    outstandingClaimInvitations: outstandingCount,
    unusedClaimInvitationsIncludingExpired: unusedCount,
  });
  if (reviewedProfileId === undefined) return;

  const invalidatedCount = await database.$transaction(async (tx) => {
    // Claim redemption also locks the token before attempting to update the profile.
    const invalidated = await tx.profileClaimToken.updateMany({
      where: unusedInvitations,
      data: { usedAt: new Date() },
    });
    const unassigned = await tx.profile.updateMany({
      where: {
        id: profile.id,
        publicId: PUBLIC_ID,
        userId,
        user: { is: { email: EXPECTED_OWNER_EMAIL, role: "CUSTOMER" } },
      },
      data: { userId: null },
    });
    if (unassigned.count !== 1) {
      throw new MaintenanceError("Ownership changed during the correction. The transaction was rolled back.");
    }
    return invalidated.count;
  });

  try {
    const [updated, remainingInvitations] = await Promise.all([
      findProfile(database),
      database.profileClaimToken.count({ where: unusedInvitations }),
    ]);
    if (
      updated?.id === profile.id &&
      updated.userId === null &&
      updated.shortCode === profile.shortCode &&
      updated.email === profile.email &&
      updated.companyId === profile.companyId &&
      remainingInvitations === 0
    ) {
      log(`Verified ${PUBLIC_ID} is unassigned with zero unused claim invitations.`, {
        invalidatedClaimInvitations: invalidatedCount,
      });
      return;
    }
  } catch {
    throw new MaintenanceError("The transaction committed, but verification could not be completed. Inspect LB0011 before retrying.");
  }
  throw new MaintenanceError("The transaction committed, but verification found unexpected state. Inspect LB0011 before retrying.");
}

async function main(args) {
  let database;
  try {
    const [mode, profileId] = args;
    const dryRun = args.length === 0 || (args.length === 1 && mode === "--dry-run");
    const apply = args.length === 2 && mode === "--apply" && profileId.trim() && !profileId.startsWith("-");
    if (!dryRun && !apply) throw new MaintenanceError(USAGE);

    ({ default: database } = await import("../src/config/prisma.js"));
    await unassignLb0011(database, { reviewedProfileId: profileId });
  } catch (error) {
    // Prisma or driver errors may contain connection details or query data.
    console.error(error instanceof MaintenanceError ? error.message : "Maintenance failed. Inspect LB0011 before retrying.");
    process.exitCode = 1;
  } finally {
    try {
      await database?.$disconnect();
    } catch {
      console.error("Could not close the database connection cleanly.");
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
