import { getPublicProfileUrl } from "./publicAppUrl.js";

function escapeVCard(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildVCard(profile) {
  const entries = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(profile.fullName)}`,
    `TITLE:${escapeVCard(profile.jobTitle)}`,
    `TEL;TYPE=CELL:${escapeVCard(profile.phone)}`,
    `EMAIL;TYPE=WORK:${escapeVCard(profile.email)}`,
    `URL:${escapeVCard(getPublicProfileUrl(profile.publicId))}`,
  ];

  if (profile.websiteUrl) {
    entries.push(`URL;TYPE=WORK:${escapeVCard(profile.websiteUrl)}`);
  }

  entries.push("END:VCARD");
  return entries.join("\r\n");
}
