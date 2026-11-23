import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";

// Fail closed before importing Prisma or the application unless this is the
// explicitly isolated local test environment. This prevents accidental use of
// a configured remote database or real storage bucket.
const fixtureDatabaseUrl = new URL(process.env.MVP_DATABASE_URL || "invalid:");
if (
  process.env.NODE_ENV !== "test" ||
  fixtureDatabaseUrl.hostname !== "127.0.0.1" ||
  fixtureDatabaseUrl.port !== "1" ||
  fixtureDatabaseUrl.pathname !== "/linkbase_isolation_test" ||
  process.env.GCS_BUCKET_NAME !== "linkbase-isolation-test"
) {
  throw new Error("Customer isolation E2E tests require the isolated local fixture configuration");
}

const [{ default: app }, { default: prisma }, { bucket }, jwtModule, jwtConfig] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/config/prisma.js"),
    import("../src/config/storage.js"),
    import("jsonwebtoken"),
    import("../src/config/jwt.js"),
  ]);

const jwt = jwtModule.default;
const { initializeJwtConfig, getJwtConfig } = jwtConfig;
initializeJwtConfig(`base64url:${randomBytes(32).toString("base64url")}`);

const TEST_PASSWORD = "FixtureOnly-password-123!";
const BUCKET_NAME = "linkbase-isolation-test";

function objectUrl(objectName) {
  return `https://storage.googleapis.com/${BUCKET_NAME}/${objectName}`;
}

function createFixtures() {
  const users = [
    { id: "fixture-admin", email: "admin@fixture.invalid", role: "ADMIN", tokenVersion: 0 },
    { id: "fixture-customer-a", email: "customer-a@fixture.invalid", role: "CUSTOMER", tokenVersion: 0 },
    { id: "fixture-customer-b", email: "customer-b@fixture.invalid", role: "CUSTOMER", tokenVersion: 0 },
  ];
  const profiles = [
    {
      id: "fixture-profile-a",
      publicId: "LBTESTA",
      shortCode: "aabbccddeeff",
      fullName: "Fixture Customer A",
      jobTitle: "Test Role A",
      email: "customer-a@fixture.invalid",
      phone: "+27000000001",
      websiteUrl: "https://a.fixture.invalid",
      photoUrl: objectUrl("profiles/LBTESTA/11111111-1111-4111-8111-111111111111.png"),
      logoUrl: objectUrl("profiles/LBTESTA/logos/22222222-2222-4222-8222-222222222222.png"),
      pdfUrl: objectUrl("profiles/fixture-profile-a/pdf/33333333-3333-4333-8333-333333333333.pdf"),
      pdfDisplayName: "customer-a-test.pdf",
      companyId: "fixture-company-1",
      userId: "fixture-customer-a",
      visitCount: 5,
      fontFamily: "Raleway",
      bodyTextColor: "#101d3b",
      backgroundColor: "#ffffff",
      buttonColor: "#101d3b",
      buttonTextColor: "#ffffff",
      saveContactButtonColor: "#101d3b",
      saveContactButtonTextColor: "#ffffff",
      socialLinkBackgroundColor: "#f1f3f7",
      socialLinkIconColor: "#14213f",
    },
    {
      id: "fixture-profile-b",
      publicId: "LBTESTB",
      shortCode: "112233445566",
      fullName: "Fixture Customer B",
      jobTitle: "Test Role B",
      email: "customer-b@fixture.invalid",
      phone: "+27000000002",
      websiteUrl: "https://b.fixture.invalid",
      photoUrl: objectUrl("profiles/LBTESTB/44444444-4444-4444-8444-444444444444.png"),
      logoUrl: objectUrl("profiles/LBTESTB/logos/55555555-5555-4555-8555-555555555555.png"),
      pdfUrl: objectUrl("profiles/fixture-profile-b/pdf/66666666-6666-4666-8666-666666666666.pdf"),
      pdfDisplayName: "customer-b-test.pdf",
      companyId: "fixture-company-1",
      userId: "fixture-customer-b",
      visitCount: 7,
      fontFamily: "Raleway",
      bodyTextColor: "#101d3b",
      backgroundColor: "#ffffff",
      buttonColor: "#101d3b",
      buttonTextColor: "#ffffff",
      saveContactButtonColor: "#101d3b",
      saveContactButtonTextColor: "#ffffff",
      socialLinkBackgroundColor: "#f1f3f7",
      socialLinkIconColor: "#14213f",
    },
  ];
  for (const user of users) user.passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

  return {
    users,
    profiles,
    companies: [
      { id: "fixture-company-1", name: "Fixture Company One", logoUrl: null, fontFamily: "Raleway" },
      { id: "fixture-company-2", name: "Fixture Company Two", logoUrl: null, fontFamily: "Raleway" },
    ],
    links: [
      { id: "fixture-link-a1", profileId: "fixture-profile-a", platform: "LinkedIn", url: "https://a.fixture.invalid/one", sortOrder: 0 },
      { id: "fixture-link-a2", profileId: "fixture-profile-a", platform: "Website", url: "https://a.fixture.invalid/two", sortOrder: 1 },
      { id: "fixture-link-b1", profileId: "fixture-profile-b", platform: "LinkedIn", url: "https://b.fixture.invalid/one", sortOrder: 0 },
      { id: "fixture-link-b2", profileId: "fixture-profile-b", platform: "Website", url: "https://b.fixture.invalid/two", sortOrder: 1 },
    ],
    storageCleanupJobs: [],
    visits: [],
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function fixtureStorage() {
  const objects = new Map();
  const events = [];
  const bucketFile = (name) => ({
    async save(buffer, options) {
      events.push({ action: "save", name });
      objects.set(name, { buffer: Buffer.from(buffer), metadata: clone(options?.metadata) });
    },
    async delete() {
      events.push({ action: "delete", name });
      objects.delete(name);
    },
    async exists() { return [objects.has(name)]; },
    async getSignedUrl() {
      events.push({ action: "sign", name });
      return [`https://storage.googleapis.com/${BUCKET_NAME}/${name}?fixture-signature=isolated`];
    },
  });

  return { objects, events, bucketFile };
}

function installPrismaFixture(store) {
  const matchesProfile = (profile, where = {}) => Object.entries(where).every(([key, value]) => {
    if (key === "AND") return matchesProfile(profile, value);
    if (key === "OR") return value.some((condition) => matchesProfile(profile, condition));
    if (key === "company") {
      const company = store.companies.find((row) => row.id === profile.companyId);
      return Boolean(company) && (company.centralisedManagement ?? false) === value.is.centralisedManagement;
    }
    return profile[key] === value;
  });
  const findUser = ({ where }) =>
    store.users.find((user) =>
      where.id ? user.id === where.id : user.email === where.email,
    ) || null;

  const findProfile = ({ where, include, select }) => {
    const profile = store.profiles.find((item) => matchesProfile(item, where));
    if (!profile) return null;
    const result = clone(profile);
    if (include?.socialLinks || select?.socialLinks) {
      result.socialLinks = clone(store.links.filter((link) => link.profileId === profile.id));
    }
    if (include?.user || select?.user) {
      const user = store.users.find((item) => item.id === profile.userId);
      result.user = user ? { id: user.id, email: user.email } : null;
    }
    if (include?.company || select?.company) {
      result.company = clone(store.companies.find((company) => company.id === profile.companyId) || null);
    }
    return result;
  };

  const delegates = [
    [prisma.user, "findUnique", async (args) => clone(findUser(args))],
    [prisma.user, "findMany", async ({ where } = {}) => clone(
      store.users.filter((user) => !where?.role || user.role === where.role).map((user) => ({
        ...user,
        profiles: store.profiles.filter((profile) => profile.userId === user.id)
          .map((profile) => ({ publicId: profile.publicId, fullName: profile.fullName })),
      })),
    )],
    [prisma.user, "count", async ({ where } = {}) => store.users.filter((user) => !where?.role || user.role === where.role).length],
    [prisma.profile, "findUnique", async (args) => findProfile(args)],
    [prisma.profile, "findFirst", async ({ where } = {}) => clone(store.profiles.find((profile) => matchesProfile(profile, where)) || null)],
    [prisma.profile, "findMany", async ({ where, include, select } = {}) => clone(
      store.profiles
        .filter((profile) => !where?.companyId || profile.companyId === where.companyId)
        .map((profile) => {
          const result = clone(profile);
          if (include?.company || select?.company) result.company = clone(store.companies.find((company) => company.id === profile.companyId) || null);
          if (include?.user || select?.user) {
            const user = store.users.find((item) => item.id === profile.userId);
            result.user = user ? { id: user.id, email: user.email } : null;
          }
          return result;
        }),
    )],
    [prisma.profile, "count", async ({ where } = {}) => store.profiles.filter((profile) =>
      (!where || !Object.hasOwn(where, "userId") || profile.userId === where.userId) &&
      (!where?.companyId || profile.companyId === where.companyId),
    ).length],
    [prisma.profile, "update", async ({ where, data }) => {
      const profile = store.profiles.find((item) => matchesProfile(item, where));
      if (!profile) throw Object.assign(new Error("Profile not found"), { code: "P2025" });
      Object.assign(profile, clone(data));
      return clone(profile);
    }],
    [prisma.profile, "updateMany", async ({ where, data }) => {
      const matches = store.profiles.filter((profile) => matchesProfile(profile, where));
      for (const profile of matches) Object.assign(profile, clone(data));
      return { count: matches.length };
    }],
    [prisma.company, "findMany", async () => clone(store.companies)],
    [prisma.company, "count", async () => store.companies.length],
    [prisma.company, "create", async ({ data }) => {
      const company = { id: `fixture-company-${store.companies.length + 1}`, ...clone(data) };
      store.companies.push(company);
      return clone(company);
    }],
    [prisma.company, "update", async ({ where, data }) => {
      const company = store.companies.find((item) => item.id === where.id);
      if (!company) throw Object.assign(new Error("Company not found"), { code: "P2025" });
      Object.assign(company, clone(data));
      return clone(company);
    }],
    [prisma.socialLink, "findMany", async ({ where } = {}) => clone(
      store.links.filter((link) => !where?.profileId || link.profileId === where.profileId),
    )],
    [prisma.socialLink, "findUnique", async ({ where, include } = {}) => {
      const link = store.links.find((item) => item.id === where.id);
      if (!link) return null;
      const result = clone(link);
      if (include?.profile) {
        const profile = store.profiles.find((item) => item.id === link.profileId);
        result.profile = profile ? { userId: profile.userId } : null;
      }
      return result;
    }],
    [prisma.socialLink, "create", async ({ data }) => {
      const link = { id: `fixture-link-new-${store.links.length}`, ...clone(data) };
      store.links.push(link);
      return clone(link);
    }],
    [prisma.socialLink, "update", async ({ where, data }) => {
      const link = store.links.find((item) => item.id === where.id);
      if (!link) throw Object.assign(new Error("Social link not found"), { code: "P2025" });
      Object.assign(link, clone(data));
      return clone(link);
    }],
    [prisma.socialLink, "delete", async ({ where }) => {
      const index = store.links.findIndex((item) => item.id === where.id);
      if (index < 0) throw Object.assign(new Error("Social link not found"), { code: "P2025" });
      return clone(store.links.splice(index, 1)[0]);
    }],
    [prisma.profileVisit, "count", async ({ where }) => store.visits.filter((visit) =>
      visit.profileId === where.profileId && visit.createdAt >= where.createdAt.gte && visit.createdAt < where.createdAt.lt,
    ).length],
    [prisma.storageCleanupJob, "create", async ({ data }) => {
      const job = {
        id: `fixture-cleanup-${randomUUID()}`,
        attempts: 0,
        availableAt: new Date(),
        lockedUntil: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...clone(data),
      };
      store.storageCleanupJobs.push(job);
      return clone(job);
    }],
    [prisma.storageCleanupJob, "createMany", async ({ data, skipDuplicates }) => {
      let count = 0;
      for (const item of data) {
        const duplicate = store.storageCleanupJobs.some((job) =>
          job.bucketName === item.bucketName && job.objectName === item.objectName,
        );
        if (duplicate && skipDuplicates) continue;
        if (duplicate) throw new Error("Duplicate fixture storage-cleanup job");
        store.storageCleanupJobs.push({
          id: `fixture-cleanup-${randomUUID()}`,
          attempts: 0,
          availableAt: new Date(),
          lockedUntil: null,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...clone(item),
        });
        count += 1;
      }
      return { count };
    }],
    [prisma.storageCleanupJob, "findMany", async ({ where = {}, orderBy, take } = {}) => {
      const jobs = store.storageCleanupJobs.filter((job) => {
        if (where.id && job.id !== where.id) return false;
        if (where.bucketName && job.bucketName !== where.bucketName) return false;
        if (typeof where.objectName === "string" && job.objectName !== where.objectName) return false;
        if (where.objectName?.in && !where.objectName.in.includes(job.objectName)) return false;
        if (where.availableAt?.lte && job.availableAt > where.availableAt.lte) return false;
        if (where.OR && !where.OR.some((condition) =>
          (condition.lockedUntil === null && job.lockedUntil === null) ||
          (condition.lockedUntil?.lte && job.lockedUntil && job.lockedUntil <= condition.lockedUntil.lte),
        )) return false;
        return true;
      });
      if (orderBy?.availableAt === "asc") jobs.sort((a, b) => a.availableAt - b.availableAt);
      if (orderBy?.createdAt === "desc") jobs.sort((a, b) => b.createdAt - a.createdAt);
      return clone(jobs.slice(0, take ?? jobs.length));
    }],
    [prisma.storageCleanupJob, "updateMany", async ({ where = {}, data }) => {
      const matches = store.storageCleanupJobs.filter((job) => {
        if (where.id && job.id !== where.id) return false;
        if (where.bucketName && job.bucketName !== where.bucketName) return false;
        if (typeof where.objectName === "string" && job.objectName !== where.objectName) return false;
        if (where.objectName?.in && !where.objectName.in.includes(job.objectName)) return false;
        if (where.availableAt?.lte && job.availableAt > where.availableAt.lte) return false;
        if (where.lockedUntil instanceof Date && job.lockedUntil?.getTime() !== where.lockedUntil.getTime()) return false;
        if (where.OR && !where.OR.some((condition) =>
          (condition.lockedUntil === null && job.lockedUntil === null) ||
          (condition.lockedUntil?.lte && job.lockedUntil && job.lockedUntil <= condition.lockedUntil.lte),
        )) return false;
        return true;
      });
      for (const job of matches) Object.assign(job, clone(data));
      return { count: matches.length };
    }],
    [prisma.storageCleanupJob, "deleteMany", async ({ where = {} } = {}) => {
      const before = store.storageCleanupJobs.length;
      store.storageCleanupJobs = store.storageCleanupJobs.filter((job) => {
        if (where.id && job.id !== where.id) return true;
        if (where.bucketName && job.bucketName !== where.bucketName) return true;
        if (typeof where.objectName === "string" && job.objectName !== where.objectName) return true;
        if (where.objectName?.in && !where.objectName.in.includes(job.objectName)) return true;
        if (where.lockedUntil instanceof Date && job.lockedUntil?.getTime() !== where.lockedUntil.getTime()) return true;
        return false;
      });
      return { count: before - store.storageCleanupJobs.length };
    }],
    [prisma, "$transaction", async (operation) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(prisma),
    ],
    [prisma, "$queryRaw", async (sql, id) => {
      const query = sql.join("?");
      if (query.includes('FROM "Company"')) return store.companies.filter((company) => company.id === id);
      const key = query.includes('WHERE "publicId"') ? "publicId" : "id";
      return store.profiles.filter((profile) => profile[key] === id);
    }],
  ];

  const originals = delegates.map(([target, key]) => [target, key, target[key]]);
  for (const [target, key, replacement] of delegates) target[key] = replacement;
  return () => {
    for (const [target, key, original] of originals) target[key] = original;
  };
}

function snapshot(store, storage) {
  return JSON.stringify({
    users: store.users,
    profiles: store.profiles,
    companies: store.companies,
    links: store.links,
    storageCleanupJobs: store.storageCleanupJobs,
    visits: store.visits,
    objects: [...storage.objects.entries()].sort(([a], [b]) => a.localeCompare(b)),
    storageEvents: storage.events,
  });
}

function createUpload(field, name, mimeType, contents) {
  const form = new FormData();
  form.append(field, new Blob([contents], { type: mimeType }), name);
  return form;
}

test("actual Express app enforces customer isolation with isolated fixtures", async (t) => {
  const store = createFixtures();
  const storage = fixtureStorage();
  for (const profile of store.profiles) {
    for (const url of [profile.photoUrl, profile.logoUrl, profile.pdfUrl]) {
      const objectName = new URL(url).pathname.split(`/${BUCKET_NAME}/`)[1];
      storage.objects.set(objectName, { buffer: Buffer.from("fixture object") });
    }
  }
  const restorePrisma = installPrismaFixture(store);
  const originalBucketName = bucket.name;
  const originalBucketFile = bucket.file;
  Object.defineProperty(bucket, "name", { configurable: true, value: BUCKET_NAME });
  bucket.file = storage.bucketFile;

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(path, { token, method = "GET", body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let requestBody = body;
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }
    return fetch(`${baseUrl}${path}`, { method, headers, body: requestBody, redirect: "manual" });
  }

  async function login(email) {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: { email, password: TEST_PASSWORD },
    });
    assert.equal(response.status, 200, `fixture login for ${email}`);
    return (await response.json()).token;
  }

  try {
    const tokens = {
      admin: await login("admin@fixture.invalid"),
      a: await login("customer-a@fixture.invalid"),
      b: await login("customer-b@fixture.invalid"),
    };
    const profileA = store.profiles[0];
    const profileB = store.profiles[1];
    const companyBeforeRejection = snapshot(store, storage);

    await t.test("each customer's private editor endpoint returns only their own profile", async () => {
      for (const [actor, ownPublicId, otherPublicId] of [
        ["a", profileA.publicId, profileB.publicId],
        ["b", profileB.publicId, profileA.publicId],
      ]) {
        const response = await request("/api/profiles/my-profile", { token: tokens[actor] });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).profile.publicId, ownPublicId);
        const manipulatedQuery = await request(`/api/profiles/my-profile?publicId=${otherPublicId}`, { token: tokens[actor] });
        assert.equal(manipulatedQuery.status, 200);
        assert.equal((await manipulatedQuery.json()).profile.publicId, ownPublicId);
      }
    });

    await t.test("Customer A and B cannot change each other's profile or company association", async () => {
      for (const [actor, own, other] of [["a", profileA, profileB], ["b", profileB, profileA]]) {
        for (const [path, body] of [
          [`/api/profiles/${other.publicId}`, { email: "changed@fixture.invalid" }],
          [`/api/profiles/${other.publicId}/my-details`, { phone: "+27999999999" }],
          [`/api/profiles/${other.publicId}`, { backgroundColor: "#abcdef" }],
          [`/api/profiles/${other.publicId}`, { companyId: "fixture-company-2" }],
          [`/api/profiles/${own.publicId}`, { companyId: "fixture-company-2" }],
        ]) {
          const response = await request(path, { token: tokens[actor], method: "PATCH", body });
          assert.equal(response.status, 403, `${actor} ${path} ${JSON.stringify(body)}`);
        }
      }
      assert.equal(snapshot(store, storage), companyBeforeRejection);
    });

    await t.test("Customer A and B cannot upload or alter each other's photos, logos, or PDFs", async () => {
      for (const [actor, other] of [["a", profileB], ["b", profileA]]) {
        for (const [route, field, filename, mimeType, bytes] of [
          ["photo", "photo", "foreign.png", "image/png", Buffer.from("photo")],
          ["logo", "logo", "foreign.png", "image/png", Buffer.from("logo")],
          ["pdf", "pdf", "foreign.pdf", "application/pdf", Buffer.from("%PDF-1.7 fixture")],
        ]) {
          const response = await request(`/api/profiles/${other.publicId}/${route}`, {
            token: tokens[actor],
            method: "POST",
            body: createUpload(field, filename, mimeType, bytes),
          });
          assert.equal(response.status, 403, `${actor} upload ${route} to ${other.publicId}`);
        }
        const rename = await request(`/api/profiles/${other.publicId}/pdf/display-name`, {
          token: tokens[actor], method: "PATCH", body: { pdfDisplayName: "attacker-name" },
        });
        assert.equal(rename.status, 403);
        const remove = await request(`/api/profiles/${other.publicId}/pdf`, {
          token: tokens[actor], method: "DELETE",
        });
        assert.equal(remove.status, 403);
      }
      assert.equal(snapshot(store, storage), companyBeforeRejection);
    });

    await t.test("social-link CRUD and reorder are isolated to the owning customer", async () => {
      for (const [actor, own, other, foreignLink] of [
        ["a", profileA, profileB, "fixture-link-b1"],
        ["b", profileB, profileA, "fixture-link-a1"],
      ]) {
        const create = await request("/api/social-links", {
          token: tokens[actor], method: "POST",
          body: { profileId: other.id, platform: "Website", url: "https://attacker.fixture.invalid" },
        });
        assert.equal(create.status, 403);
        const update = await request(`/api/social-links/${foreignLink}`, {
          token: tokens[actor], method: "PATCH", body: { url: "https://attacker.fixture.invalid" },
        });
        assert.equal(update.status, 403);
        const remove = await request(`/api/social-links/${foreignLink}`, {
          token: tokens[actor], method: "DELETE",
        });
        assert.equal(remove.status, 403);
        const reorder = await request("/api/social-links/reorder", {
          token: tokens[actor], method: "PATCH",
          body: { profileId: other.id, orderedIds: store.links.filter((link) => link.profileId === other.id).map((link) => link.id) },
        });
        assert.equal(reorder.status, 403);
        const stats = await request(`/api/profiles/${other.publicId}/statistics`, { token: tokens[actor] });
        assert.equal(stats.status, 403);
      }
      assert.equal(snapshot(store, storage), companyBeforeRejection);
    });

    await t.test("customers cannot delete accounts, change companies, or access administrator endpoints", async () => {
      for (const [actor, targetUserId, targetProfile, companyId] of [
        ["a", "fixture-customer-b", profileB, "fixture-company-1"],
        ["b", "fixture-customer-a", profileA, "fixture-company-1"],
      ]) {
        const checks = [
          ["DELETE", `/api/admin/customers/${targetUserId}`],
          ["DELETE", `/api/admin/profiles/${targetProfile.publicId}`],
          ["GET", "/api/admin/summary"],
          ["GET", "/api/admin/customers"],
          ["GET", "/api/admin/profiles"],
          ["GET", `/api/companies/${companyId}/profiles`],
          ["PATCH", `/api/companies/${companyId}`],
          ["DELETE", `/api/companies/${companyId}`],
          ["POST", "/api/companies"],
          ["POST", "/api/profiles"],
          ["PATCH", `/api/profiles/${targetProfile.publicId}/assign`],
          ["POST", "/api/auth/users"],
        ];
        for (const [method, path] of checks) {
          const response = await request(path, {
            token: tokens[actor], method,
            body: method === "POST" || method === "PATCH" ? { companyId: "fixture-company-2", name: "Not permitted" } : undefined,
          });
          assert.equal(response.status, 403, `${actor} ${method} ${path}`);
        }
      }
      assert.equal(snapshot(store, storage), companyBeforeRejection);
      assert.deepEqual(storage.events, []);
    });

    await t.test("public profile and PDF access remain available", async () => {
      const profileResponse = await request(`/api/profiles/${profileB.publicId}`);
      assert.equal(profileResponse.status, 200);
      assert.equal((await profileResponse.json()).profile.publicId, profileB.publicId);

      const pdfResponse = await request(`/api/profiles/${profileB.publicId}/pdf/download`);
      assert.equal(pdfResponse.status, 302);
      assert.match(pdfResponse.headers.get("location"), /^https:\/\/storage\.googleapis\.com\//);
      assert.equal(storage.events.filter((event) => event.action === "sign").length, 1);
    });

    await t.test("each customer can edit and upload assets to their own profile", async () => {
      for (const [actor, profile] of [["a", profileA], ["b", profileB]]) {
        const edit = await request(`/api/profiles/${profile.publicId}/my-details`, {
          token: tokens[actor], method: "PATCH",
          body: { fullName: `${profile.fullName} Updated`, phone: "+27000000009" },
        });
        assert.equal(edit.status, 200);

        for (const [route, field, filename, mimeType, bytes] of [
          ["photo", "photo", "own.png", "image/png", Buffer.from("own-photo")],
          ["logo", "logo", "own.png", "image/png", Buffer.from("own-logo")],
          ["pdf", "pdf", "own.pdf", "application/pdf", Buffer.from("%PDF-1.7 own fixture")],
        ]) {
          const response = await request(`/api/profiles/${profile.publicId}/${route}`, {
            token: tokens[actor], method: "POST",
            body: createUpload(field, filename, mimeType, bytes),
          });
          assert.equal(response.status, 200, `${actor} own ${route} upload`);
        }

        const rename = await request(`/api/profiles/${profile.publicId}/pdf/display-name`, {
          token: tokens[actor], method: "PATCH",
          body: { pdfDisplayName: `${actor}-renamed` },
        });
        assert.equal(rename.status, 200);

        const removePdf = await request(`/api/profiles/${profile.publicId}/pdf`, {
          token: tokens[actor], method: "DELETE",
        });
        assert.equal(removePdf.status, 200);
        assert.equal(store.profiles.find((item) => item.id === profile.id).pdfUrl, null);

        const ownLinks = store.links.filter((link) => link.profileId === profile.id);
        const reorder = await request("/api/social-links/reorder", {
          token: tokens[actor], method: "PATCH",
          body: { profileId: profile.id, orderedIds: ownLinks.map((link) => link.id).reverse() },
        });
        assert.equal(reorder.status, 200);
        const stats = await request(`/api/profiles/${profile.publicId}/statistics`, { token: tokens[actor] });
        assert.equal(stats.status, 200);
      }
      assert.ok(storage.events.some((event) => event.action === "save"));
      assert.deepEqual(store.storageCleanupJobs, []);
    });

    await t.test("customers can create, update, and delete their own social links", async () => {
      for (const [actor, profile] of [["a", profileA], ["b", profileB]]) {
        const create = await request("/api/social-links", {
          token: tokens[actor], method: "POST",
          body: { profileId: profile.id, platform: "Website", url: "https://owned.fixture.invalid" },
        });
        assert.equal(create.status, 201);
        const linkId = (await create.json()).socialLink.id;
        const update = await request(`/api/social-links/${linkId}`, {
          token: tokens[actor], method: "PATCH", body: { url: "https://updated.fixture.invalid" },
        });
        assert.equal(update.status, 200);
        const remove = await request(`/api/social-links/${linkId}`, {
          token: tokens[actor], method: "DELETE",
        });
        assert.equal(remove.status, 200);
      }
    });

    await t.test("administrator retains legitimate access and can change company association", async () => {
      for (const path of ["/api/admin/summary", "/api/admin/customers", "/api/admin/profiles"]) {
        const response = await request(path, { token: tokens.admin });
        assert.equal(response.status, 200, path);
      }
      const association = await request(`/api/profiles/${profileB.publicId}`, {
        token: tokens.admin, method: "PATCH", body: { companyId: "fixture-company-2" },
      });
      assert.equal(association.status, 200);
      assert.equal(store.profiles.find((profile) => profile.publicId === profileB.publicId).companyId, "fixture-company-2");
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restorePrisma();
    bucket.file = originalBucketFile;
    Object.defineProperty(bucket, "name", { configurable: true, value: originalBucketName });
  }
});
