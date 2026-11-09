import assert from "node:assert/strict";
import test from "node:test";
import { canCustomizeProfile } from "../src/services/profileValidation.js";
import {
  createProfilePdfObjectName,
  getProfilePdfObjectName,
  removeStoredProfilePdf,
  uploadAndReplaceProfilePdf,
  validatePdfFile,
} from "../src/services/profilePdf.js";

const validPdf = {
  originalname: "document.PDF",
  mimetype: "application/pdf",
  size: 8,
  buffer: Buffer.from("%PDF-1.7"),
};

test("PDF validation requires PDF MIME type, extension, signature and size", () => {
  assert.equal(validatePdfFile(validPdf), null);
  assert.match(validatePdfFile({ ...validPdf, mimetype: "text/plain" }), /PDF/);
  assert.match(validatePdfFile({ ...validPdf, originalname: "document.txt" }), /extension/);
  assert.match(validatePdfFile({ ...validPdf, buffer: Buffer.from("not pdf") }), /signature/);
  assert.match(validatePdfFile({ ...validPdf, size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.match(validatePdfFile(null), /select/);
});

test("PDF object keys are unique and constrained to their configured bucket and profile", () => {
  const first = createProfilePdfObjectName("profile-1");
  const second = createProfilePdfObjectName("profile-1");
  assert.notEqual(first, second);
  assert.match(first, /^profiles\/profile-1\/pdf\/[0-9a-f-]+\.pdf$/i);
  const url = `https://storage.googleapis.com/linkbase-bucket/${first}`;
  assert.equal(getProfilePdfObjectName(url, "linkbase-bucket", "profile-1"), first);
  assert.equal(getProfilePdfObjectName(url, "other-bucket", "profile-1"), null);
  assert.equal(getProfilePdfObjectName(url, "linkbase-bucket", "profile-2"), null);
  assert.equal(
    getProfilePdfObjectName("https://storage.googleapis.com/linkbase-bucket/profiles/profile-1/photo.png", "linkbase-bucket", "profile-1"),
    null,
  );
});

test("only admins and the assigned customer pass the PDF profile ownership check", () => {
  const profile = { userId: "customer-1" };
  assert.equal(canCustomizeProfile({ role: "ADMIN", id: "admin" }, profile), true);
  assert.equal(canCustomizeProfile({ role: "CUSTOMER", id: "customer-1" }, profile), true);
  assert.equal(canCustomizeProfile({ role: "CUSTOMER", id: "customer-2" }, profile), false);
});

test("replacement stores the new PDF before persisting it and deleting the old object", async () => {
  const events = [];
  const bucket = {
    name: "linkbase-bucket",
    file(name) {
      return {
        async save() { events.push(`save:${name}`); },
        async delete() { events.push(`delete:${name}`); },
      };
    },
  };
  const oldUrl = "https://storage.googleapis.com/linkbase-bucket/profiles/profile-1/pdf/a1b2-c3d4.pdf";
  const result = await uploadAndReplaceProfilePdf({
    bucket,
    profileId: "profile-1",
    publicId: "LB001",
    buffer: validPdf.buffer,
    previousPdfUrl: oldUrl,
    async persist(pdfUrl) {
      events.push("persist");
      return { publicId: "LB001", pdfUrl };
    },
  });
  assert.match(result.pdfUrl, /\/api\/profiles\/LB001\/pdf\/download$/);
  assert.match(events[0], /^save:/);
  assert.equal(events[1], "persist");
  assert.equal(events[2], "delete:profiles/profile-1/pdf/a1b2-c3d4.pdf");
});

test("removal clears the profile URL before deleting only a same-bucket profile PDF", async () => {
  const events = [];
  const bucket = {
    name: "linkbase-bucket",
    file(name) { return { async delete() { events.push(`delete:${name}`); } }; },
  };
  const oldUrl = "https://storage.googleapis.com/linkbase-bucket/profiles/profile-1/pdf/a1b2-c3d4.pdf";
  await removeStoredProfilePdf({
    bucket,
    profileId: "profile-1",
    previousPdfUrl: oldUrl,
    async clear() { events.push("clear"); },
    async restore() { events.push("restore"); },
  });
  assert.deepEqual(events, ["clear", "delete:profiles/profile-1/pdf/a1b2-c3d4.pdf"]);

  events.length = 0;
  await removeStoredProfilePdf({
    bucket,
    profileId: "profile-1",
    previousPdfUrl: "https://storage.googleapis.com/other-bucket/profiles/profile-1/pdf/file.pdf",
    async clear() { events.push("clear"); },
    async restore() { events.push("restore"); },
  });
  assert.deepEqual(events, ["clear"]);
});
