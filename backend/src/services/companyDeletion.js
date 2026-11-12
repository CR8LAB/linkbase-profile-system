export function createCompanyDeletionHandler({
  deleteCompanyIfUnassociated,
}) {
  return async function deleteCompany(req, res) {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ message: "Administrator access required" });
    }

    try {
      const result = await deleteCompanyIfUnassociated(req.params.companyId);
      if (result.status === "not-found") {
        return res.status(404).json({ message: "Company not found" });
      }
      if (result.status === "profiles-associated") {
        return res.status(409).json({
          message: "This company has associated profiles. Reassign the profiles before deleting the company.",
        });
      }
      if (result.status === "deleted") {
        return res.status(200).json({
          success: true,
          message: "Company deleted successfully",
        });
      }
      throw new Error("Company deletion returned an unexpected status");
    } catch (error) {
      console.error("Company deletion failed:", error);
      return res.status(500).json({ message: "Failed to delete company" });
    }
  };
}

export async function deleteCompanyWithNoProfiles(tx, companyId) {
  const companies = await tx.$queryRaw`
    SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE
  `;
  if (companies.length === 0) return { status: "not-found" };

  const profileCount = await tx.profile.count({ where: { companyId } });
  if (profileCount > 0) return { status: "profiles-associated" };

  await tx.company.delete({ where: { id: companyId } });
  return { status: "deleted" };
}
