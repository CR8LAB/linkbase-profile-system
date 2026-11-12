import { randomUUID } from "node:crypto";
import path from "node:path";

export const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_PDF_DISPLAY_NAME = "LinkBase-profile.pdf";

export function validatePdfDisplayName(value) {
  if (typeof value !== "string") {
    return { error: "PDF display name must be text" };
  }

  const displayName = value.trim();
  const baseName = displayName.replace(/(?:\.pdf)+$/i, "");
  if (!baseName || baseName.length > 120) {
    return { error: "PDF display name must be between 1 and 120 characters" };
  }
  if (/[/\\<>:"|?*\u0000-\u001f\u007f]/u.test(baseName)) {
    return { error: "PDF display name contains unsafe characters" };
  }
  if (
    !baseName ||
    baseName.includes("..") ||
    /[. ]$/.test(baseName) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(baseName)
  ) {
    return { error: "PDF display name is not a valid filename" };
  }

  return { value: `${baseName}.pdf` };
}

export function getUploadPdfDisplayName(originalName) {
  const baseName = String(originalName || "")
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  const result = validatePdfDisplayName(baseName);
  return result.value || DEFAULT_PDF_DISPLAY_NAME;
}

export function getPdfContentDisposition(displayName) {
  const result = validatePdfDisplayName(displayName);
  const filename = result.value || DEFAULT_PDF_DISPLAY_NAME;
  const asciiFilename = filename.replace(/[^\x20-\x7e]/g, "_");
  const encodedFilename = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

export function createPdfDisplayNameUpdateHandler({
  findProfile,
  updateProfile,
  canCustomize,
}) {
  return async function updatePdfDisplayName(req, res) {
    const result = validatePdfDisplayName(req.body?.pdfDisplayName);
    if (result.error) return res.status(400).json({ message: result.error });

    try {
      const profile = await findProfile(req.params.publicId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      if (!canCustomize(req.user, profile)) {
        return res.status(403).json({ message: "You cannot edit this profile" });
      }
      if (!profile.pdfUrl) {
        return res.status(409).json({ message: "Upload a PDF before naming it" });
      }

      const updated = await updateProfile(req.params.publicId, result.value);
      return res.status(200).json({ success: true, profile: updated });
    } catch (error) {
      console.error("Profile PDF display name update failed:", error);
      return res.status(500).json({ message: "Failed to update PDF display name" });
    }
  };
}

export function createPdfDownloadHandler({ findProfile, bucket }) {
  return async function redirectProfilePdf(req, res) {
    try {
      const profile = await findProfile(req.params.publicId);
      if (!profile?.pdfUrl) return res.status(404).json({ message: "PDF not found" });

      const objectName = getProfilePdfObjectName(
        profile.pdfUrl,
        bucket.name,
        profile.id,
      );
      if (!objectName) return res.status(404).json({ message: "PDF not found" });

      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ message: "PDF not found" });
      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 5 * 60 * 1000,
        responseType: "application/pdf",
        responseDisposition: getPdfContentDisposition(
          profile.pdfDisplayName || DEFAULT_PDF_DISPLAY_NAME,
        ),
      });
      return res.redirect(302, signedUrl);
    } catch (error) {
      console.error("Profile PDF download signing failed:", error.message);
      return res.status(503).json({ message: "PDF download is temporarily unavailable" });
    }
  };
}

export function validatePdfFile(file) {
  if (!file) return "Please select a PDF";
  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    return "The uploaded PDF is empty or invalid";
  }
  if (file.size > MAX_PDF_SIZE_BYTES || file.buffer.length > MAX_PDF_SIZE_BYTES) {
    return "PDF must be 5 MB or smaller";
  }
  if (file.mimetype !== "application/pdf") return "Only PDF files are allowed";
  if (path.extname(file.originalname || "").toLowerCase() !== ".pdf") {
    return "The file must have a .pdf extension";
  }
  if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return "The file does not have a valid PDF signature";
  }
  return null;
}

export function createProfilePdfObjectName(profileId) {
  return `profiles/${profileId}/pdf/${randomUUID()}.pdf`;
}

export function getProfilePdfObjectName(pdfUrl, bucketName, profileId) {
  try {
    const url = new URL(pdfUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "storage.googleapis.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) return null;

    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 3 || parts[0] !== bucketName) return null;
    const objectName = parts.slice(1).join("/");
    if (!objectName.startsWith(`profiles/${profileId}/pdf/`)) return null;
    const fileName = objectName.slice(`profiles/${profileId}/pdf/`.length);
    if (!/^[0-9a-f-]+\.pdf$/i.test(fileName)) return null;
    return objectName;
  } catch {
    return null;
  }
}

export function getProfilePhotoObjectName(photoUrl, bucketName, publicId) {
  try {
    const url = new URL(photoUrl);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "storage.googleapis.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) return null;

    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length !== 4 || parts[0] !== bucketName) return null;
    const objectName = parts.slice(1).join("/");
    if (!objectName.startsWith(`profiles/${publicId}/`)) return null;
    const fileName = objectName.slice(`profiles/${publicId}/`.length);
    if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(fileName)) return null;
    return objectName;
  } catch {
    return null;
  }
}

export async function removeProfileMedia({ bucket, profile }) {
  const objectNames = [
    getProfilePhotoObjectName(profile.photoUrl, bucket.name, profile.publicId),
    getProfilePdfObjectName(profile.pdfUrl, bucket.name, profile.id),
  ].filter(Boolean);

  for (const objectName of objectNames) {
    await bucket.file(objectName).delete({ ignoreNotFound: true });
  }
}

export function getPdfDownloadUrl(publicId) {
  return `/api/profiles/${encodeURIComponent(publicId)}/pdf/download`;
}

export async function uploadAndReplaceProfilePdf({
  bucket,
  profileId,
  publicId,
  buffer,
  previousPdfUrl,
  pdfDisplayName,
  persist,
}) {
  const objectName = createProfilePdfObjectName(profileId);
  const object = bucket.file(objectName);
  await object.save(buffer, {
    resumable: false,
    metadata: { contentType: "application/pdf", cacheControl: "private, no-store" },
  });

  const storedUrl = `https://storage.googleapis.com/${bucket.name}/${objectName}`;
  let persisted;
  try {
    persisted = await persist(storedUrl, pdfDisplayName);
  } catch (error) {
    await object.delete().catch(() => {});
    throw error;
  }

  const oldObjectName = getProfilePdfObjectName(previousPdfUrl, bucket.name, profileId);
  if (oldObjectName && oldObjectName !== objectName) {
    await bucket.file(oldObjectName).delete().catch((error) => {
      console.error("Could not remove replaced profile PDF object:", error.message);
    });
  }
  return {
    ...persisted,
    pdfUrl: getPdfDownloadUrl(publicId),
    pdfDisplayName,
  };
}

export async function removeStoredProfilePdf({
  bucket,
  profileId,
  previousPdfUrl,
  clear,
  restore,
}) {
  await clear();
  const objectName = getProfilePdfObjectName(previousPdfUrl, bucket.name, profileId);
  if (!objectName) return;
  try {
    await bucket.file(objectName).delete();
  } catch (error) {
    await restore();
    throw error;
  }
}
