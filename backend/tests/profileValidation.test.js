import assert from "node:assert/strict";
import test from "node:test";
import {
  canCustomizeProfile,
  customerProfileCustomizationFields,
  profileCustomizationFields,
  normalizeWhatsAppNumber,
  validateProfileCustomization,
} from "../src/services/profileValidation.js";

test("only administrators and the assigned customer can customize a profile", () => {
  const profile = { userId: "customer-1" };

  assert.equal(
    canCustomizeProfile({ id: "admin-1", role: "ADMIN" }, profile),
    true,
  );
  assert.equal(
    canCustomizeProfile({ id: "customer-1", role: "CUSTOMER" }, profile),
    true,
  );
  assert.equal(
    canCustomizeProfile({ id: "customer-2", role: "CUSTOMER" }, profile),
    false,
  );
  assert.equal(
    canCustomizeProfile(
      { id: "customer-1", role: "CUSTOMER" },
      { userId: null },
    ),
    false,
  );
  assert.equal(canCustomizeProfile(null, profile), false);
});

test("profile customization accepts supported fields and normalizes values", () => {
  const result = validateProfileCustomization({
    fullName: "  Ada Lovelace  ",
    email: "ada@example.com",
    bodyTextColor: "#A1B2C3",
    backgroundColor: "#AABBCC",
    buttonColor: "#123456",
    buttonTextColor: "#ffffff",
    saveContactButtonColor: "#AABBCC",
    saveContactButtonTextColor: "#DDEEFF",
    socialLinkBackgroundColor: "#CCDDEE",
    socialLinkIconColor: "#112233",
    fontFamily: "Montserrat",
    userId: "cannot-be-changed",
    shortCode: "cannot-be-changed",
    photoUrl: "cannot-be-changed",
  });

  assert.deepEqual(result, {
    updates: {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      bodyTextColor: "#a1b2c3",
      backgroundColor: "#aabbcc",
      buttonColor: "#123456",
      buttonTextColor: "#ffffff",
      saveContactButtonColor: "#aabbcc",
      saveContactButtonTextColor: "#ddeeff",
      socialLinkBackgroundColor: "#ccddee",
      socialLinkIconColor: "#112233",
      fontFamily: "Montserrat",
    },
  });
  assert.equal(profileCustomizationFields.includes("photoUrl"), false);
  assert.equal(profileCustomizationFields.includes("userId"), false);
  assert.equal(profileCustomizationFields.includes("shortCode"), false);
});

test("profile customization rejects invalid colors, fonts, URLs and names", () => {
  for (const body of [
    { fullName: "  " },
    { backgroundColor: "url(javascript:alert(1))" },
    { bodyTextColor: "#xyz" },
    { buttonColor: "#abc" },
    { buttonTextColor: "red" },
    { saveContactButtonColor: "#abc" },
    { saveContactButtonTextColor: "blue" },
    { socialLinkBackgroundColor: "#abc" },
    { socialLinkIconColor: "not-a-color" },
    { fontFamily: "Unsupported Font" },
    { websiteUrl: "javascript:alert(1)" },
    { email: "not-an-email" },
  ]) {
    assert.ok(validateProfileCustomization(body).error, JSON.stringify(body));
  }
});

test("new location, review and WhatsApp fields are administrator-only", () => {
  for (const field of ["businessAddress", "googleReviewUrl", "whatsappNumber"]) {
    assert.ok(profileCustomizationFields.includes(field));
    assert.equal(customerProfileCustomizationFields.includes(field), false);
  }
  assert.ok(validateProfileCustomization({ businessAddress: "Market Street" }, customerProfileCustomizationFields).error);
  assert.ok(validateProfileCustomization({ googleReviewUrl: "https://reviews.example" }, customerProfileCustomizationFields).error);
  assert.ok(validateProfileCustomization({ whatsappNumber: "+442071838750" }, customerProfileCustomizationFields).error);
});

test("location, review URL and WhatsApp fields validate and normalize safely", () => {
  assert.deepEqual(validateProfileCustomization({
    businessAddress: "  10 Market Street, London  ",
    googleReviewUrl: "https://example.com/review?ref=linkbase",
    whatsappNumber: "  +44 (20) 7183-8750  ",
  }), {
    updates: {
      businessAddress: "10 Market Street, London",
      googleReviewUrl: "https://example.com/review?ref=linkbase",
      whatsappNumber: "+442071838750",
    },
  });
  assert.equal(normalizeWhatsAppNumber("0044 20 7183 8750"), "+442071838750");
  assert.equal(normalizeWhatsAppNumber("0712345678"), null);
  assert.equal(normalizeWhatsAppNumber("+1<script>"), null);
  assert.equal(normalizeWhatsAppNumber(""), "");
  for (const url of ["http://example.com/review", "javascript:alert(1)", "https://user:pass@example.com/review"]) {
    assert.ok(validateProfileCustomization({ googleReviewUrl: url }).error, url);
  }
});

test("customer's existing customization whitelist is preserved", () => {
  assert.deepEqual(customerProfileCustomizationFields, [
    "fullName", "jobTitle", "email", "phone", "websiteUrl", "fontFamily",
    "bodyTextColor", "backgroundColor", "buttonColor", "buttonTextColor",
    "saveContactButtonColor", "saveContactButtonTextColor",
    "socialLinkBackgroundColor", "socialLinkIconColor",
  ]);

  assert.deepEqual(
    validateProfileCustomization(
      {
        fullName: " Ada Lovelace ",
        email: "ada@example.com",
        backgroundColor: "#aabbcc",
        bodyTextColor: "#112233",
        fontFamily: "Montserrat",
        buttonColor: "#123456",
        buttonTextColor: "#ffffff",
        saveContactButtonColor: "#334455",
        saveContactButtonTextColor: "#ffffff",
        socialLinkBackgroundColor: "#eeeeee",
        socialLinkIconColor: "#222222",
      },
      customerProfileCustomizationFields,
    ),
    {
      updates: {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        backgroundColor: "#aabbcc",
        bodyTextColor: "#112233",
        fontFamily: "Montserrat",
        buttonColor: "#123456",
        buttonTextColor: "#ffffff",
        saveContactButtonColor: "#334455",
        saveContactButtonTextColor: "#ffffff",
        socialLinkBackgroundColor: "#eeeeee",
        socialLinkIconColor: "#222222",
      },
    },
  );

  assert.deepEqual(
    validateProfileCustomization({
      fullName: " Ada Lovelace ",
      email: "ada@example.com",
      backgroundColor: "#aabbcc",
      bodyTextColor: "#112233",
      fontFamily: "Montserrat",
      buttonColor: "#123456",
      buttonTextColor: "#ffffff",
      saveContactButtonColor: "#334455",
      saveContactButtonTextColor: "#ffffff",
      socialLinkBackgroundColor: "#eeeeee",
      socialLinkIconColor: "#222222",
    }),
    validateProfileCustomization(
      {
        fullName: " Ada Lovelace ",
        email: "ada@example.com",
        backgroundColor: "#aabbcc",
        bodyTextColor: "#112233",
        fontFamily: "Montserrat",
        buttonColor: "#123456",
        buttonTextColor: "#ffffff",
        saveContactButtonColor: "#334455",
        saveContactButtonTextColor: "#ffffff",
        socialLinkBackgroundColor: "#eeeeee",
        socialLinkIconColor: "#222222",
      },
      customerProfileCustomizationFields,
    ),
  );

  assert.deepEqual(
    validateProfileCustomization(
      {
        fullName: " Ada Lovelace ",
        email: "ada@example.com",
      },
      customerProfileCustomizationFields,
    ),
    {
      updates: {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
      },
    },
  );
});
