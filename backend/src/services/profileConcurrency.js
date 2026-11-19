export async function assignProfileAtomically(tx, publicId, userId) {
  // Serialize assignments for one customer before taking any profile lock.
  // This keeps the customer -> profile lock order consistent across requests.
  const users = await tx.$queryRaw`
    SELECT "id", "role", "email"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;
  const user = users[0] || null;
  if (!user || user.role !== "CUSTOMER") return { status: "invalid-customer" };

  const customerProfile = await tx.profile.findFirst({
    where: { userId },
    select: { publicId: true },
  });

  const profiles = await tx.$queryRaw`
    SELECT "id", "publicId", "fullName", "userId"
    FROM "Profile"
    WHERE "publicId" = ${publicId}
    FOR UPDATE
  `;
  const profile = profiles[0] || null;
  if (!profile) return { status: "not-found" };

  if (profile.userId === userId) {
    return {
      status: "assigned",
      profile: { publicId: profile.publicId, fullName: profile.fullName, user: { email: user.email } },
    };
  }
  if (profile.userId) return { status: "profile-conflict" };

  if (customerProfile) return { status: "customer-conflict" };

  // Keep the predicate as a final guard in addition to the ordered row locks
  // and the database's unique Profile.userId constraint.
  const assigned = await tx.profile.updateMany({
    where: { publicId, userId: null },
    data: { userId },
  });
  if (assigned.count !== 1) return { status: "profile-conflict" };

  return {
    status: "assigned",
    profile: {
      publicId: profile.publicId,
      fullName: profile.fullName,
      user: { email: user.email },
    },
  };
}
