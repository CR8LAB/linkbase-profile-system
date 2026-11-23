import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

const fixtureUrl = process.env.LINKBASE_COMPANY_TEST_DATABASE_URL;

test("the Express API enforces company administration against isolated PostgreSQL", { skip: !fixtureUrl }, async (t) => {
  const url = new URL(fixtureUrl);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55487");
  assert.equal(url.pathname, "/linkbase_company_test");
  assert.equal(url.search, "");
  process.env.MVP_DATABASE_URL = fixtureUrl;
  process.env.NODE_ENV = "test";
  process.env.GCS_BUCKET_NAME = "linkbase-company-test";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";
  process.env.EMAIL_FROM = "fixture@example.test";
  process.env.PUBLIC_APP_URL = "http://localhost:5173";
  const jwtSecret = randomBytes(32);
  process.env.JWT_SECRET = `hex:${jwtSecret.toString("hex")}`;

  const [
    { default: app }, { default: db }, { bucket }, { default: bcrypt },
    { default: jwt }, { default: nodemailer }, authSecurity,
    { persistProfileAssetReplacement }, { profileManagementWhere },
  ] = await Promise.all([
    import("../src/app.js"), import("../src/config/prisma.js"), import("../src/config/storage.js"),
    import("bcrypt"), import("jsonwebtoken"), import("nodemailer"), import("../src/services/authSecurity.js"),
    import("../src/services/storageCleanup.js"), import("../src/services/profileValidation.js"),
  ]);
  const sent = [];
  const restoreTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({ sendMail: async (mail) => { sent.push(mail); } });
  const restoreBucket = bucket.file;
  const stored = new Set();
  bucket.file = (name) => ({
    async save() { stored.add(name); },
    async delete() { stored.delete(name); },
    async exists() { return [stored.has(name)]; },
  });

  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    nodemailer.createTransport = restoreTransport;
    bucket.file = restoreBucket;
    await new Promise((resolve) => server.close(resolve));
    await db.$disconnect();
  });
  await once(server, "listening");

  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, { token, method = "GET", body } = {}) => {
    const isForm = body instanceof FormData;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(body && !isForm && { "Content-Type": "application/json" }),
      },
      body: isForm ? body : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const send = (path, token, body, method = "POST") => request(path, { token, method, body });
  const upload = (field, type, filename, bytes) => {
    const form = new FormData();
    form.append(field, new Blob([bytes], { type }), filename);
    return form;
  };
  const sign = (user, claims = {}) => jwt.sign({ userId: user.id, role: user.role, tokenVersion: 0, ...claims }, jwtSecret, { expiresIn: "20m" });
  const suffix = randomBytes(4).toString("hex");
  const email = (name) => `${name}-${suffix}@example.test`;
  const password = "local-fixture-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const createUser = (name, role) => db.user.create({ data: { email: email(name), passwordHash, role } });
  const [sme, other, otherManaged, admin, employee, customer] = await Promise.all([
    db.company.create({ data: { name: `SME-${suffix}`, centralisedManagement: true } }),
    db.company.create({ data: { name: `Other-${suffix}` } }),
    db.company.create({ data: { name: `Other managed-${suffix}`, centralisedManagement: true } }),
    createUser("admin", "ADMIN"), createUser("employee", "CUSTOMER"), createUser("customer", "CUSTOMER"),
  ]);
  assert.equal(other.centralisedManagement, false);
  const adminToken = sign(admin);
  const employeeToken = sign(employee);
  const customerToken = sign(customer);
  const addProfile = (name, companyId, userId = null) => db.profile.create({ data: {
    publicId: `${name}-${suffix}`, fullName: name, shortCode: randomBytes(6).toString("hex"),
    companyId, userId, email: email(name),
  } });
  const smeProfiles = await Promise.all(Array.from({ length: 9 }, (_, index) =>
    addProfile(`SME-${index + 1}`, sme.id, index === 0 ? employee.id : null)));
  const [own, unowned] = smeProfiles;
  const foreign = await addProfile("other", other.id, customer.id);
  const foreignManaged = await addProfile("other-managed", otherManaged.id);
  const otherUnowned = await addProfile("other-claim", other.id);
  const addLink = ({ id }) => db.socialLink.create({ data: { profileId: id, platform: "Website", url: "https://example.test" } });
  const [ownLink, foreignLink] = await Promise.all([addLink(own), addLink(foreignManaged)]);
  const inviteUrl = `/auth/companies/${sme.id}/admin-invitations`;
  const mayaEmail = email("maya");
  const invitationToken = (mail) => {
    const link = new URL(mail.text.match(/^http[^\n]+$/m)[0]);
    assert.equal(link.pathname, "/claim-company-admin");
    return new URLSearchParams(link.hash.slice(1)).get("token");
  };
  let mayaToken;
  let maya;

  await t.test("requires platform admin and binds the invitation, email, scope and role server-side", async () => {
    assert.equal((await send(inviteUrl, employeeToken, { email: mayaEmail })).status, 403);
    assert.equal((await send(inviteUrl, adminToken, { email: employee.email })).status, 409);
    assert.equal((await send(inviteUrl, adminToken, { email: mayaEmail, companyId: other.id })).status, 202);
    const oldToken = invitationToken(sent.at(-1));
    assert.equal((await send(inviteUrl, adminToken, { email: mayaEmail })).status, 202);
    assert.equal(sent.at(-1).to, mayaEmail);
    const token = invitationToken(sent.at(-1));
    const invitation = await db.companyAdminInvitation.findUnique({ where: { tokenHash: authSecurity.hashOneTimeToken(token) } });
    assert.equal(invitation.companyId, sme.id);
    assert.equal((await send("/auth/claim-company-admin", null, { token: oldToken, password })).status, 400);
    const created = await send("/auth/claim-company-admin", null, { token, password, email: employee.email, companyId: other.id, role: "ADMIN" });
    assert.equal(created.status, 201);
    maya = await db.user.findUnique({ where: { email: mayaEmail } });
    assert.equal(maya.role, "COMPANY_ADMIN");
    assert.equal(maya.companyId, sme.id);
    assert.equal((await send("/auth/claim-company-admin", null, { token, password })).status, 400);
    const login = await send("/auth/login", null, { email: mayaEmail, password, role: "ADMIN" });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, "COMPANY_ADMIN");
    mayaToken = login.body.token;
    assert.equal((await send(inviteUrl, adminToken, { email: email("second-admin") })).status, 409);
  });

  await t.test("gives Maya all nine profiles, private editor access, edits, analytics, photos and link management", async () => {
    assert.ok(mayaToken);
    const list = await request("/profiles/managed/list", { token: mayaToken });
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.profiles.map((p) => p.publicId).sort(), smeProfiles.map((p) => p.publicId).sort());
    assert.equal((await request(`/profiles/${own.publicId}/editor`, { token: mayaToken })).body.profile.id, own.id);
    const update = await send(`/profiles/${unowned.publicId}`, mayaToken, {
      fullName: "Updated", jobTitle: "Engineer", businessAddress: "42 Fixture Street", googleReviewUrl: "https://www.google.com/maps/place/Example",
    }, "PATCH");
    assert.equal(update.status, 200);
    assert.equal(update.body.profile.businessAddress, "42 Fixture Street");
    const photo = upload("photo", "image/jpeg", "fixture.jpg", "local-fixture");
    assert.equal((await send(`/profiles/${own.publicId}/photo`, mayaToken, photo)).status, 200);
    assert.equal(stored.size, 1);
    const link = await send("/social-links", mayaToken, { profileId: own.id, platform: "Website", url: "https://example.test/a" });
    assert.equal(link.status, 201);
    const newLink = link.body.socialLink.id;
    assert.equal((await send(`/social-links/${newLink}`, mayaToken, { url: "https://example.test/b" }, "PATCH")).status, 200);
    assert.equal((await send("/social-links/reorder", mayaToken, { profileId: own.id, orderedIds: [newLink, ownLink.id] }, "PATCH")).status, 200);
    assert.equal((await send(`/social-links/${newLink}`, mayaToken, undefined, "DELETE")).status, 200);
    assert.equal((await send(`/profiles/${own.publicId}/visits`)).status, 204);
    assert.equal((await request(`/profiles/${own.publicId}/statistics`, { token: mayaToken })).body.total, 1);
  });

  await t.test("company administrators can edit all profile appearance fields and manage branding assets", async () => {
    const appearance = {
      fontFamily: "Arial",
      bodyTextColor: "#102030",
      backgroundColor: "#203040",
      buttonColor: "#304050",
      buttonTextColor: "#405060",
      saveContactButtonColor: "#506070",
      saveContactButtonTextColor: "#607080",
      socialLinkBackgroundColor: "#708090",
      socialLinkIconColor: "#8090a0",
    };
    const editRoute = `/profiles/${own.publicId}`;
    assert.equal((await send(editRoute, mayaToken, appearance, "PATCH")).status, 200);
    const saved = await db.profile.findUnique({ where: { id: own.id } });
    for (const [key, value] of Object.entries(appearance)) assert.equal(saved[key], value, key);
    assert.equal((await send(editRoute, mayaToken, { backgroundColor: "invalid" }, "PATCH")).status, 400);
    assert.equal((await send(editRoute, mayaToken, { backgroundImageUrl: "https://example.test/unsafe" }, "PATCH")).status, 400);

    const logo = upload("logo", "image/png", "logo.png", "fixture-logo");
    const logoResult = await send(`${editRoute}/logo`, mayaToken, logo);
    assert.equal(logoResult.status, 200);
    assert.match(logoResult.body.profile.logoUrl, /\/logos\//);
    const jpeg = Uint8Array.of(0xff, 0xd8, 0xff);
    const badBackground = upload("backgroundImage", "image/jpeg", "background.jpg", "invalid bytes");
    assert.equal((await send(`${editRoute}/background-image`, mayaToken, badBackground)).status, 400);
    const background = upload("backgroundImage", "image/jpeg", "background.jpg", jpeg);
    const backgroundResult = await send(`${editRoute}/background-image`, mayaToken, background);
    assert.equal(backgroundResult.status, 200);
    assert.match(backgroundResult.body.profile.backgroundImageUrl, /\/background\//);
    const pdf = upload("pdf", "application/pdf", "fixture.pdf", "%PDF-1.7\n");
    assert.equal((await send(`${editRoute}/pdf`, mayaToken, pdf)).status, 200);
    assert.equal((await send(`${editRoute}/pdf/display-name`, mayaToken, { pdfDisplayName: "Company brochure" }, "PATCH")).status, 200);
    const storedProfile = await db.profile.findUnique({ where: { id: own.id } });
    assert.equal(storedProfile.logoUrl, logoResult.body.profile.logoUrl);
    assert.equal(storedProfile.backgroundImageUrl, backgroundResult.body.profile.backgroundImageUrl);
    assert.equal(storedProfile.pdfDisplayName, "Company brochure.pdf");
    assert.equal((await send(`${editRoute}/pdf`, mayaToken, undefined, "DELETE")).status, 200);
    assert.equal((await db.profile.findUnique({ where: { id: own.id } })).pdfUrl, null);
  });

  await t.test("denies other companies' content and branding and blocks platform operations despite conflicting JWT claims", async () => {
    assert.ok(maya);
    const token = sign(maya, { role: "ADMIN", companyId: otherManaged.id });
    assert.equal((await request(`/profiles/${foreignManaged.publicId}/editor`, { token })).status, 404);
    assert.equal((await send(`/profiles/${foreignManaged.publicId}`, token, { fullName: "Denied", fontFamily: "Arial" }, "PATCH")).status, 403);
    for (const route of ["photo", "logo", "background-image", "pdf"]) {
      assert.equal((await send(`/profiles/${foreignManaged.publicId}/${route}`, token)).status, 403);
    }
    assert.equal((await send(`/profiles/${foreignManaged.publicId}/pdf/display-name`, token, { pdfDisplayName: "Denied" }, "PATCH")).status, 403);
    assert.equal((await send(`/profiles/${foreignManaged.publicId}/pdf`, token, undefined, "DELETE")).status, 403);
    assert.equal((await request(`/profiles/${foreignManaged.publicId}/statistics`, { token })).status, 403);
    assert.equal((await send("/social-links", token, { profileId: foreignManaged.id, platform: "Website", url: "https://example.test" })).status, 403);
    assert.equal((await send(`/social-links/${foreignLink.id}`, token, { url: "https://example.test/a" }, "PATCH")).status, 403);
    assert.equal((await send(`/social-links/${foreignLink.id}`, token, undefined, "DELETE")).status, 403);
    assert.equal((await send("/social-links/reorder", token, { profileId: own.id, orderedIds: [foreignLink.id] }, "PATCH")).status, 400);
    assert.equal((await send("/social-links/reorder", token, { profileId: foreignManaged.id, orderedIds: [foreignLink.id] }, "PATCH")).status, 403);
    assert.equal((await send(`/profiles/${own.publicId}`, token, { companyId: other.id }, "PATCH")).status, 403);
    assert.equal((await send("/profiles", token, { publicId: `denied-${suffix}`, fullName: "Denied", companyId: sme.id })).status, 403);
    assert.equal((await send(`/admin/profiles/${own.publicId}`, token, undefined, "DELETE")).status, 403);
    assert.equal((await send(`/profiles/${own.publicId}/assign`, token, { userId: customer.id }, "PATCH")).status, 403);
    assert.equal((await send("/companies", token, { name: "Denied" })).status, 403);
    assert.equal((await send(`/companies/${sme.id}`, token, { name: "Denied", fontFamily: "Arial" }, "PATCH")).status, 403);
    assert.equal((await send(`/companies/${sme.id}`, token, undefined, "DELETE")).status, 403);
    assert.equal((await request("/admin/summary", { token })).status, 403);
    assert.equal((await request(`/companies/${otherManaged.id}/profiles`, { token })).status, 403);
    assert.equal((await send(inviteUrl, token, { email: mayaEmail })).status, 403);
    assert.equal((await request(`/profiles/${foreignManaged.publicId}`, { token })).status, 200);
    assert.equal((await request(`/short-links/${foreignManaged.shortCode}`)).body.path, `/profile/${foreignManaged.publicId}`);
  });

  await t.test("exclusive mode blocks both individual claim paths and existing owners while other customers retain access", async () => {
    assert.equal((await send(`/auth/profiles/${unowned.publicId}/claim-invitations`, adminToken, { email: unowned.email })).status, 403);
    const token = authSecurity.createOneTimeToken();
    const pending = await db.profileClaimToken.create({ data: {
      profileId: unowned.id, email: unowned.email, tokenHash: authSecurity.hashOneTimeToken(token), expiresAt: new Date(Date.now() + 60_000),
    } });
    assert.equal((await send("/auth/claim", null, { token, password })).status, 400);
    assert.equal((await db.profileClaimToken.findUnique({ where: { id: pending.id } })).usedAt, null);
    assert.equal((await send(`/profiles/${own.publicId}/my-details`, employeeToken, { fullName: "Denied" }, "PATCH")).status, 403);
    assert.equal((await send(`/profiles/${own.publicId}/photo`, employeeToken)).status, 403);
    assert.equal((await send(`/profiles/${own.publicId}/pdf/display-name`, employeeToken, { pdfDisplayName: "Denied" }, "PATCH")).status, 403);
    assert.equal((await send(`/social-links/${ownLink.id}`, employeeToken, undefined, "DELETE")).status, 403);
    assert.equal((await request(`/profiles/${own.publicId}/statistics`, { token: employeeToken })).status, 403);
    assert.equal((await send(`/profiles/${foreign.publicId}`, customerToken, { fullName: "Still allowed" }, "PATCH")).status, 200);
    assert.equal((await send(`/profiles/${foreign.publicId}/background-image`, customerToken)).status, 403);
    assert.equal((await request(`/profiles/${own.publicId}/editor`, { token: adminToken })).status, 200);
    assert.equal((await send(`/auth/profiles/${otherUnowned.publicId}/claim-invitations`, adminToken, { email: otherUnowned.email })).status, 202);
    const profileClaimLink = new URL(sent.at(-1).text.match(/^http[^\n]+$/m)[0]);
    assert.equal((await send("/auth/claim", null, { token: new URLSearchParams(profileClaimLink.hash.slice(1)).get("token"), password })).status, 201);
  });

  await t.test("logo persistence rechecks scope after an intervening profile reassignment", async () => {
    assert.ok(maya);
    await db.profile.update({ where: { id: unowned.id }, data: { companyId: otherManaged.id } });
    const result = await persistProfileAssetReplacement({
      database: db, bucketName: bucket.name, publicId: unowned.publicId, profileId: unowned.id,
      expectedUserId: null, accessWhere: profileManagementWhere(maya), imageField: "logoUrl", expectedUrl: null,
      newUrl: `https://storage.googleapis.com/${bucket.name}/prospective-logo`,
      newObjectName: `profiles/${unowned.publicId}/logos/11111111-1111-1111-1111-111111111111.jpg`,
    });
    assert.equal(result, null);
    assert.equal((await db.profile.findUnique({ where: { id: unowned.id } })).logoUrl, null);
  });

  await t.test("Maya can reset her password and keep the same company scope", async () => {
    assert.equal((await send("/auth/password-reset/request", null, { email: mayaEmail })).status, 202);
    const resetLink = new URL(sent.at(-1).text.match(/^http[^\n]+$/m)[0]);
    assert.equal(resetLink.pathname, "/reset-password");
    const token = new URLSearchParams(resetLink.hash.slice(1)).get("token");
    const nextPassword = "local-fixture-updated-password";
    assert.equal((await send("/auth/password-reset/complete", null, { token, password: nextPassword })).status, 200);
    assert.equal((await request("/profiles/managed/list", { token: mayaToken })).status, 401);
    const login = await send("/auth/login", null, { email: mayaEmail, password: nextPassword });
    assert.equal(login.body.user.role, "COMPANY_ADMIN");
    const freshList = await request("/profiles/managed/list", { token: login.body.token });
    assert.equal(freshList.status, 200);
    assert.equal(freshList.body.profiles.length, 8);
    assert.equal(freshList.body.profiles.some((profile) => profile.publicId === unowned.publicId), false);
  });
});
