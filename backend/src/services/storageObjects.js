function parseObjectUrl(value, bucketName) {
  try {
    const url = new URL(value);
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
    if (parts.length < 2 || parts[0] !== bucketName) return null;
    return parts.slice(1).join("/");
  } catch {
    return null;
  }
}

function generatedFileName(value, extensions) {
  return new RegExp(`^[0-9a-f-]+\\.(?:${extensions})$`, "i").test(value);
}

export function getProfilePhotoObjectName(photoUrl, bucketName, publicId) {
  const objectName = parseObjectUrl(photoUrl, bucketName);
  if (!objectName) return null;
  const parts = objectName.split("/");
  if (
    parts.length !== 3 ||
    parts[0] !== "profiles" ||
    parts[1] !== publicId ||
    !generatedFileName(parts[2], "jpg|png|webp")
  ) return null;
  return objectName;
}

export function getProfileLogoObjectName(logoUrl, bucketName, publicId) {
  const objectName = parseObjectUrl(logoUrl, bucketName);
  if (!objectName) return null;
  const parts = objectName.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "profiles" ||
    parts[1] !== publicId ||
    parts[2] !== "logos" ||
    !generatedFileName(parts[3], "jpg|png|webp")
  ) return null;
  return objectName;
}

export function getProfilePdfObjectName(pdfUrl, bucketName, profileId) {
  const objectName = parseObjectUrl(pdfUrl, bucketName);
  if (!objectName) return null;
  const parts = objectName.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "profiles" ||
    parts[1] !== profileId ||
    parts[2] !== "pdf" ||
    !generatedFileName(parts[3], "pdf")
  ) return null;
  return objectName;
}

export function getProfileMediaObjects(profile, bucketName) {
  const objects = [
    getProfilePhotoObjectName(profile.photoUrl, bucketName, profile.publicId),
    getProfileLogoObjectName(profile.logoUrl, bucketName, profile.publicId),
    getProfilePdfObjectName(profile.pdfUrl, bucketName, profile.id),
  ].filter(Boolean);
  return [...new Set(objects)].map((objectName) => ({ objectName, bucketName }));
}

export function isGeneratedProfileObjectName(objectName) {
  return /^profiles\/[^/]+\/(?:[0-9a-f-]+\.(?:jpg|png|webp)|logos\/[0-9a-f-]+\.(?:jpg|png|webp)|pdf\/[0-9a-f-]+\.pdf)$/i.test(objectName);
}

export function getStorageObjectUrl(bucketName, objectName) {
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}
