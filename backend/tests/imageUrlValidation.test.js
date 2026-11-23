import assert from "node:assert/strict";
import test from "node:test";
import prisma from "../src/config/prisma.js";
import { bucket } from "../src/config/storage.js";
import { createCompany, updateCompany } from "../src/controllers/companyController.js";
import {
  createProfile,
  updateProfile,
  uploadMyPhoto,
  uploadProfileLogo,
} from "../src/controllers/profileController.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function withStubs(stubs, callback) {
  const originals = stubs.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, replacement] of stubs) target[key] = replacement;
  try {
    await callback();
  } finally {
    for (const [target, key, original] of originals) target[key] = original;
  }
}

function validProfileBody(extra = {}) {
  return {
    publicId: "LB2001",
    fullName: "Ada Lovelace",
    companyId: "company-1",
    ...extra,
  };
}

test("profile creation without image URLs succeeds and leaves them unset", async () => {
  let createData;
  await withStubs(
    [[prisma.profile, "create", async ({ data }) => {
      createData = data;
      return { id: "profile-1", ...data };
    }]],
    async () => {
      const response = createResponse();
      await createProfile({ body: validProfileBody() }, response);

      assert.equal(response.statusCode, 201);
      assert.equal(Object.hasOwn(createData, "photoUrl"), false);
      assert.equal(Object.hasOwn(createData, "logoUrl"), false);
    },
  );
});

test("profile creation rejects a client-supplied photo URL before database access", async () => {
  let createCalls = 0;
  await withStubs(
    [[prisma.profile, "create", async () => { createCalls += 1; }]],
    async () => {
      const response = createResponse();
      await createProfile(
        { body: validProfileBody({ photoUrl: "https://outside.example/photo.png" }) },
        response,
      );

      assert.equal(response.statusCode, 400);
      assert.match(response.body.message, /photoUrl.*upload/i);
      assert.equal(createCalls, 0);
    },
  );
});

test("profile creation rejects a client-supplied logo URL before database access", async () => {
  let createCalls = 0;
  await withStubs(
    [[prisma.profile, "create", async () => { createCalls += 1; }]],
    async () => {
      const response = createResponse();
      await createProfile(
        { body: validProfileBody({ logoUrl: "https://outside.example/logo.png" }) },
        response,
      );

      assert.equal(response.statusCode, 400);
      assert.match(response.body.message, /logoUrl.*upload/i);
      assert.equal(createCalls, 0);
    },
  );
});

test("company creation without a logo URL succeeds and leaves it unset", async () => {
  let createData;
  await withStubs(
    [[prisma.company, "create", async ({ data }) => {
      createData = data;
      return { id: "company-1", ...data };
    }]],
    async () => {
      const response = createResponse();
      await createCompany({ body: { name: "Analytical Engines" } }, response);

      assert.equal(response.statusCode, 201);
      assert.equal(Object.hasOwn(createData, "logoUrl"), false);
    },
  );
});

test("company creation rejects a client-supplied logo URL before database access", async () => {
  let createCalls = 0;
  await withStubs(
    [[prisma.company, "create", async () => { createCalls += 1; }]],
    async () => {
      const response = createResponse();
      await createCompany(
        { body: { name: "Analytical Engines", logoUrl: "https://outside.example/logo.png" } },
        response,
      );

      assert.equal(response.statusCode, 400);
      assert.match(response.body.message, /logoUrl.*not supported/i);
      assert.equal(createCalls, 0);
    },
  );
});

test("existing profile photo and logo upload handlers still write to GCS", async () => {
  const savedObjects = [];
  const profileRecord = {
    id: "profile-test-id",
    publicId: "LB2001",
    fullName: "Ada Lovelace",
    userId: "customer-1",
    companyId: null,
    photoUrl: null,
    logoUrl: null,
  };
  const cleanupJobs = [];
  const previousFile = bucket.file;
  bucket.file = (name) => ({
    async save(buffer, options) {
      savedObjects.push({ name, buffer, options });
    },
  });

  try {
    await withStubs(
      [
        [prisma.profile, "findUnique", async () => profileRecord],
        [prisma.profile, "updateMany", async ({ where, data }) => {
          if (profileRecord.userId !== where.userId || profileRecord[Object.keys(data)[0]] !== where[Object.keys(data)[0]]) {
            return { count: 0 };
          }
          Object.assign(profileRecord, data);
          return { count: 1 };
        }],
        [prisma, "$transaction", async (work) => work(prisma)],
        [prisma, "$queryRaw", async () => [profileRecord]],
        [prisma.storageCleanupJob, "create", async ({ data }) => {
          cleanupJobs.push({ id: `job-${cleanupJobs.length}`, attempts: 0, lockedUntil: null, ...data });
          return cleanupJobs.at(-1);
        }],
        [prisma.storageCleanupJob, "createMany", async ({ data }) => {
          cleanupJobs.push(...data.map((item, index) => ({ id: `job-${cleanupJobs.length + index}`, attempts: 0, lockedUntil: null, ...item })));
          return { count: data.length };
        }],
        [prisma.storageCleanupJob, "findMany", async () => []],
        [prisma.storageCleanupJob, "updateMany", async () => ({ count: 0 })],
        [prisma.storageCleanupJob, "deleteMany", async ({ where }) => {
          const before = cleanupJobs.length;
          for (let index = cleanupJobs.length - 1; index >= 0; index -= 1) {
            if (cleanupJobs[index].bucketName === where.bucketName && cleanupJobs[index].objectName === where.objectName) cleanupJobs.splice(index, 1);
          }
          return { count: before - cleanupJobs.length };
        }],
      ],
      async () => {
        const user = { id: "customer-1", role: "CUSTOMER" };
        const file = {
          mimetype: "image/png",
          buffer: Buffer.from("image bytes"),
        };

        const photoResponse = createResponse();
        await uploadMyPhoto(
          { params: { publicId: "LB2001" }, file, user },
          photoResponse,
        );
        const logoResponse = createResponse();
        await uploadProfileLogo(
          { params: { publicId: "LB2001" }, file, user },
          logoResponse,
        );

        assert.equal(photoResponse.statusCode, 200);
        assert.equal(logoResponse.statusCode, 200);
        assert.equal(savedObjects.length, 2);
        assert.match(savedObjects[0].name, /^profiles\/LB2001\/[0-9a-f-]+\.png$/i);
        assert.match(savedObjects[1].name, /^profiles\/LB2001\/logos\/[0-9a-f-]+\.png$/i);
        assert.equal(photoResponse.body.profile.photoUrl,
          `https://storage.googleapis.com/${bucket.name}/${savedObjects[0].name}`);
        assert.equal(logoResponse.body.profile.logoUrl,
          `https://storage.googleapis.com/${bucket.name}/${savedObjects[1].name}`);
        assert.equal(cleanupJobs.length, 0);
      },
    );
  } finally {
    bucket.file = previousFile;
  }
});

test("general profile editing cannot change photoUrl or logoUrl", async () => {
  let updateData;
  await withStubs(
    [
      [prisma.profile, "findUnique", async () => ({ userId: "admin-1" })],
      [prisma.profile, "update", async ({ data }) => {
        updateData = data;
        return { pdfUrl: null };
      }],
    ],
    async () => {
      const response = createResponse();
      await updateProfile(
        {
          params: { publicId: "LB2001" },
          user: { id: "admin-1", role: "ADMIN" },
          body: {
            photoUrl: "https://outside.example/photo.png",
            logoUrl: "https://outside.example/logo.png",
          },
        },
        response,
      );

      assert.equal(response.statusCode, 200);
      assert.equal(Object.hasOwn(updateData, "photoUrl"), false);
      assert.equal(Object.hasOwn(updateData, "logoUrl"), false);
    },
  );
});

test("company editing cannot change logoUrl", async () => {
  let updateData;
  await withStubs(
    [[prisma.company, "update", async ({ data }) => {
      updateData = data;
      return { id: "company-1", name: data.name, fontFamily: data.fontFamily };
    }]],
    async () => {
      const response = createResponse();
      await updateCompany(
        {
          params: { companyId: "company-1" },
          body: {
            name: "Analytical Engines",
            fontFamily: "Raleway",
            logoUrl: "https://outside.example/logo.png",
          },
        },
        response,
      );

      assert.equal(response.statusCode, 200);
      assert.equal(Object.hasOwn(updateData, "logoUrl"), false);
    },
  );
});
