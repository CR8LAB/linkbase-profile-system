export const DEFAULT_PDF_DISPLAY_NAME_INPUT = "LinkBase-profile";

export function toPdfDisplayNameInput(value) {
  const baseName = typeof value === "string"
    ? value.trim().replace(/(?:\.pdf)+$/i, "").trim()
    : "";
  return baseName || DEFAULT_PDF_DISPLAY_NAME_INPUT;
}

export function validatePdfDisplayNameInput(value) {
  const baseName = typeof value === "string"
    ? value.trim().replace(/(?:\.pdf)+$/i, "").trim()
    : "";
  if (!baseName || baseName.length > 120) {
    return { error: "PDF display name must be between 1 and 120 characters" };
  }
  return { value: baseName };
}
