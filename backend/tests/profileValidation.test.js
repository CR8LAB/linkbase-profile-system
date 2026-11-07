import assert from "node:assert/strict";
import test from "node:test";
import {
  canCustomizeProfile,
  customerProfileCustomizationFields,
  profileCustomizationFields,
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

test("admins and customers have the same profile customization fields", () => {
  assert.deepEqual(customerProfileCustomizationFields, profileCustomizationFields);

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
