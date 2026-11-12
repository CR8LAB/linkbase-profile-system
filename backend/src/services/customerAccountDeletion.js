export async function deleteCustomerAccountInTransaction(tx, userId) {
  const customer = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!customer) return { status: "not-found" };
  if (customer.role !== "CUSTOMER") return { status: "not-customer" };

  await tx.profile.updateMany({
    where: { userId: customer.id },
    data: { userId: null },
  });
  await tx.user.delete({ where: { id: customer.id } });

  return { status: "deleted" };
}

export function createCustomerAccountDeletionHandler({ transaction }) {
  return async function deleteAdminCustomer(req, res) {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ message: "Administrator access required" });
    }

    const { userId } = req.params;
    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({ message: "Customer ID is required" });
    }

    try {
      const result = await transaction((tx) =>
        deleteCustomerAccountInTransaction(tx, userId),
      );

      if (result.status === "not-found") {
        return res.status(404).json({ message: "Customer account not found" });
      }
      if (result.status === "not-customer") {
        return res.status(409).json({
          message: "This endpoint can only delete customer accounts",
        });
      }
      if (result.status === "deleted") {
        return res.status(200).json({
          success: true,
          message: "Customer account deleted. Any assigned public profile remains active and unassigned.",
        });
      }

      throw new Error("Customer deletion returned an unexpected status");
    } catch (error) {
      if (error.code === "P2025") {
        return res.status(404).json({
          message: "Customer account not found or already deleted",
        });
      }
      console.error("Customer account deletion failed:", error);
      return res.status(500).json({ message: "Failed to delete customer account" });
    }
  };
}
