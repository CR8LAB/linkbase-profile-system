const MAX_BACKGROUND_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateProfileBackgroundImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    return "Please select a background image";
  }
  if (file.size > MAX_BACKGROUND_IMAGE_BYTES || file.buffer.length > MAX_BACKGROUND_IMAGE_BYTES) {
    return "Background image must be 5 MB or smaller";
  }

  const signatures = {
    "image/jpeg": file.buffer.length >= 3 &&
      file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff,
    "image/png": file.buffer.length >= 8 &&
      file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/webp": file.buffer.length >= 12 &&
      file.buffer.toString("ascii", 0, 4) === "RIFF" &&
      file.buffer.toString("ascii", 8, 12) === "WEBP",
  };
  if (!Object.hasOwn(signatures, file.mimetype)) {
    return "Only JPEG, PNG and WebP background images are allowed";
  }
  if (!signatures[file.mimetype]) {
    return "Background image content does not match its file type";
  }
  return null;
}
