import assert from "node:assert/strict";
import test from "node:test";
import { canCustomizeProfile } from "../src/services/profileValidation.js";
import {
  createPdfDisplayNameUpdateHandler,
  createPdfDownloadHandler,
  createProfilePdfObjectName,
  clearProfilePdfIfUnchanged,
  persistProfilePdfIfUnchanged,
  restoreProfilePdfIfEmpty,
  getPdfContentDisposition,
  getProfilePdfObjectName,
  getProfilePhotoObjectName,
  getProfileLogoObjectName,
  getUploadPdfDisplayName,
  removeStoredProfilePdf,
  uploadAndReplaceProfilePdf,
  validatePdfDisplayName,
  validatePdfFile,
} from "../src/services/profilePdf.js";
import { getProfileMediaObjects } from "../src/services/storageCleanup.js";

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

test("PDF display names accept a safe base name and normalize to one PDF extension", () => {
  assert.deepEqual(validatePdfDisplayName("  Client Guide.PDF  "), {
    value: "Client Guide.pdf",
  });
  assert.deepEqual(validatePdfDisplayName("LinkBase-profile"), {
    value: "LinkBase-profile.pdf",
  });
  assert.deepEqual(validatePdfDisplayName("report.pdf.pdf"), {
    value: "report.pdf",
  });
  assert.deepEqual(validatePdfDisplayName("x".repeat(120)), {
    value: `${"x".repeat(120)}.pdf`,
  });
  assert.match(validatePdfDisplayName("x".repeat(121)).error, /1 and 120/);
  assert.match(validatePdfDisplayName("").error, /1 and 120/);
  assert.match(validatePdfDisplayName("   ").error, /1 and 120/);
  assert.equal(validatePdfDisplayName("../private.pdf").error.includes("unsafe"), true);
  assert.equal(validatePdfDisplayName("Unsafe/Name").error.includes("unsafe"), true);
  assert.ok(validatePdfDisplayName("..").error);
  assert.ok(validatePdfDisplayName("CON.pdf").error);
  assert.equal(getUploadPdfDisplayName("client-guide.PDF"), "client-guide.pdf");
  assert.equal(getUploadPdfDisplayName("../../invalid?.pdf"), "LinkBase-profile.pdf");
  assert.equal(
    getPdfContentDisposition("Rapport été.pdf"),
    'attachment; filename="Rapport _t_.pdf"; filename*=UTF-8\'\'Rapport%20%C3%A9t%C3%A9.pdf',
  );
  assert.match(getPdfContentDisposition("report.pdf.pdf"), /filename="report\.pdf";/);
});

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    redirectCode: null,
    redirectUrl: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    redirect(code, url) {
      this.redirectCode = code;
      this.redirectUrl = url;
      return this;
    },
  };
}

test("PDF name updates authorize admins and assigned customers without touching storage", async () => {
  const changes = [];
  const storedProfile = {
    userId: "customer-1",
    pdfUrl: "/api/profiles/LB001/pdf/download",
    pdfDisplayName: "Old name.pdf",
  };
  const handler = createPdfDisplayNameUpdateHandler({
    async findProfile() {
      return storedProfile;
    },
    async updateProfile(publicId, pdfDisplayName) {
      changes.push({ publicId, pdfDisplayName });
      storedProfile.pdfDisplayName = pdfDisplayName;
      return { publicId, pdfDisplayName };
    },
    canCustomize: canCustomizeProfile,
  });

  for (const user of [
    { id: "admin-1", role: "ADMIN" },
    { id: "customer-1", role: "CUSTOMER" },
  ]) {
    const response = createResponse();
    await handler(
      { params: { publicId: "LB001" }, body: { pdfDisplayName: " New name " }, user },
      response,
    );
    assert.equal(response.statusCode, 200);
  }
  assert.deepEqual(changes, [
    { publicId: "LB001", pdfDisplayName: "New name.pdf" },
    { publicId: "LB001", pdfDisplayName: "New name.pdf" },
  ]);
  assert.equal(storedProfile.pdfUrl, "/api/profiles/LB001/pdf/download");
  assert.equal(storedProfile.pdfDisplayName, "New name.pdf");

  const forbiddenResponse = createResponse();
  await handler(
    {
      params: { publicId: "LB001" },
      body: { pdfDisplayName: "Unsafe/Name.pdf" },
      user: { id: "customer-2", role: "CUSTOMER" },
    },
    forbiddenResponse,
  );
  assert.equal(forbiddenResponse.statusCode, 400);

  const deniedResponse = createResponse();
  await handler(
    {
      params: { publicId: "LB001" },
      body: { pdfDisplayName: "New name.pdf" },
      user: { id: "customer-2", role: "CUSTOMER" },
    },
    deniedResponse,
  );
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(changes.length, 2);
});

test("public PDF downloads sign the configured filename without exposing the storage URL in JSON", async () => {
  let signedOptions;
  const handler = createPdfDownloadHandler({
    async findProfile() {
      return {
        id: "profile-1",
        pdfUrl: "https://storage.googleapis.com/linkbase-bucket/profiles/profile-1/pdf/a1b2-c3d4.pdf",
        pdfDisplayName: "Client Guide.pdf",
      };
    },
    bucket: {
      name: "linkbase-bucket",
      file(objectName) {
        assert.equal(objectName, "profiles/profile-1/pdf/a1b2-c3d4.pdf");
        return {
          async exists() { return [true]; },
          async getSignedUrl(options) {
            signedOptions = options;
            return ["https://signed.example/file?token=temporary"];
          },
        };
      },
    },
  });
  const response = createResponse();
  await handler({ params: { publicId: "LB001" } }, response);

  assert.equal(response.redirectCode, 302);
  assert.equal(response.redirectUrl, "https://signed.example/file?token=temporary");
  assert.equal(
    signedOptions.responseDisposition,
    'attachment; filename="Client Guide.pdf"; filename*=UTF-8\'\'Client%20Guide.pdf',
  );
  assert.equal(signedOptions.action, "read");
  assert.equal(signedOptions.responseType, "application/pdf");
  assert.equal(response.body, null);
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

test("profile media extraction includes only generated same-bucket photo, logo and PDF objects", () => {
  const profile = {
    id: "profile-1",
    publicId: "LB001",
    photoUrl: "https://storage.googleapis.com/linkbase-bucket/profiles/LB001/a1b2-c3d4.webp",
    logoUrl: "https://storage.googleapis.com/linkbase-bucket/profiles/LB001/logos/a1b2-c3d4.png",
    pdfUrl: "https://storage.googleapis.com/linkbase-bucket/profiles/profile-1/pdf/a1b2-c3d4.pdf",
  };

  assert.equal(
    getProfilePhotoObjectName(profile.photoUrl, "linkbase-bucket", profile.publicId),
    "profiles/LB001/a1b2-c3d4.webp",
  );
  assert.equal(
    getProfileLogoObjectName(profile.logoUrl, "linkbase-bucket", profile.publicId),
    "profiles/LB001/logos/a1b2-c3d4.png",
  );
  assert.deepEqual(getProfileMediaObjects(profile, "linkbase-bucket").map(({ objectName }) => objectName), [
    "profiles/LB001/a1b2-c3d4.webp",
    "profiles/LB001/logos/a1b2-c3d4.png",
    "profiles/profile-1/pdf/a1b2-c3d4.pdf",
  ]);

  assert.equal(
    getProfilePhotoObjectName(
      "https://storage.googleapis.com/linkbase-bucket/profiles/other-profile/a1b2-c3d4.webp",
      "linkbase-bucket",
      profile.publicId,
    ),
    null,
  );
  assert.equal(
    getProfilePhotoObjectName(
      "https://storage.googleapis.com/other-bucket/profiles/LB001/a1b2-c3d4.webp",
      "linkbase-bucket",
      profile.publicId,
    ),
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
    pdfDisplayName: "replacement.pdf",
    async createCleanupCandidate(_bucketName, objectName) { events.push(`candidate:${objectName}`); },
    async activateCleanupCandidate(_bucketName, objectName) { events.push(`activate:${objectName}`); },
    async processCleanup() { events.push("process-cleanup"); },
    async persist(pdfUrl, pdfDisplayName) {
      events.push("persist");
      events.push(`enqueue-old:${oldUrl}`);
      return { publicId: "LB001", pdfUrl, pdfDisplayName };
    },
  });
  assert.match(result.pdfUrl, /\/api\/profiles\/LB001\/pdf\/download$/);
  assert.equal(result.pdfDisplayName, "replacement.pdf");
  assert.match(events[0], /^candidate:/);
  assert.match(events[1], /^save:/);
  assert.equal(events[2], "persist");
  assert.match(events[3], /^enqueue-old:/);
  assert.equal(events[4], "process-cleanup");
});

test("removal clears the profile URL before deleting only a same-bucket profile PDF", async () => {
  const events = [];
  const profile = {
    pdfUrl: "https://storage.googleapis.com/linkbase-bucket/profiles/profile-1/pdf/a1b2-c3d4.pdf",
    pdfDisplayName: "Client Guide.pdf",
  };
  await removeStoredProfilePdf({
    async clear() {
      profile.pdfUrl = null;
      profile.pdfDisplayName = null;
      events.push("clear");
      return true;
    },
    async processCleanup() { events.push("process-cleanup"); },
  });
  assert.deepEqual(events, ["clear", "process-cleanup"]);
  assert.deepEqual(profile, { pdfUrl: null, pdfDisplayName: null });

  events.length = 0;
  await removeStoredProfilePdf({
    async clear() { events.push("clear"); return true; },
    async processCleanup() { events.push("process-cleanup"); },
  });
  assert.deepEqual(events, ["clear", "process-cleanup"]);
});

test("PDF database transitions compare the previously read URL", async () => {
  const calls = [];
  const database = {
    profile: {
      async updateMany(args) {
        calls.push(args);
        return { count: 0 };
      },
    },
  };

  assert.equal(
    await persistProfilePdfIfUnchanged(
      database,
      "LB001",
      "old-url",
      "new-url",
      "new.pdf",
    ),
    null,
  );
  assert.equal(
    (await clearProfilePdfIfUnchanged(database, "LB001", "old-url")).count,
    0,
  );
  await restoreProfilePdfIfEmpty(database, "LB001", "old-url", "old.pdf");
  assert.deepEqual(calls, [
    { where: { publicId: "LB001", pdfUrl: "old-url" }, data: { pdfUrl: "new-url", pdfDisplayName: "new.pdf" } },
    { where: { publicId: "LB001", pdfUrl: "old-url" }, data: { pdfUrl: null, pdfDisplayName: null } },
    { where: { publicId: "LB001", pdfUrl: null }, data: { pdfUrl: "old-url", pdfDisplayName: "old.pdf" } },
  ]);
});

test("a PDF removal conflict does not call storage deletion", async () => {
  let storageDeletes = 0;
  await assert.rejects(
    removeStoredProfilePdf({
      bucket: {
        name: "linkbase-bucket",
      },
      async clear() { return false; },
      async processCleanup() { storageDeletes += 1; },
    }),
    (error) => error.code === "PROFILE_PDF_CONFLICT",
  );
  assert.equal(storageDeletes, 0);
});
