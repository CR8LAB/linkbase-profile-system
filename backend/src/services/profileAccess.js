export const individualClaimWhere = {
  OR: [{ companyId: null }, { company: { is: { centralisedManagement: false } } }],
};

// A profile move and company policy change must wait for the authorised write.
export async function lockProfileScope(tx, { id, publicId }) {
  const [profile] = id !== undefined
    ? await tx.$queryRaw`SELECT "id", "companyId" FROM "Profile" WHERE "id" = ${id} FOR UPDATE`
    : await tx.$queryRaw`SELECT "id", "companyId" FROM "Profile" WHERE "publicId" = ${publicId} FOR UPDATE`;

  if (profile?.companyId != null) {
    await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${profile.companyId} FOR SHARE`;
  }
  return profile;
}
