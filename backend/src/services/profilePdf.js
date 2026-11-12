import { randomUUID } from "node:crypto";
import path from "node:path";

export const MAX_PDF_SIZE_BYTES = 5 * 1024 * 1024;

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
    persisted = await persist(storedUrl);
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
  return { ...persisted, pdfUrl: getPdfDownloadUrl(publicId) };
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
