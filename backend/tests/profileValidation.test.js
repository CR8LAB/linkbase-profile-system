import assert from "node:assert/strict";
import test from "node:test";
import {
  canCustomizeProfile,
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
    fontFamily: "Montserrat",
    userId: "cannot-be-changed",
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
      fontFamily: "Montserrat",
    },
  });
  assert.equal(profileCustomizationFields.includes("photoUrl"), false);
  assert.equal(profileCustomizationFields.includes("userId"), false);
});

test("profile customization rejects invalid colors, fonts, URLs and names", () => {
  for (const body of [
    { fullName: "  " },
    { backgroundColor: "url(javascript:alert(1))" },
    { bodyTextColor: "#xyz" },
    { buttonColor: "#abc" },
    { buttonTextColor: "red" },
    { fontFamily: "Unsupported Font" },
    { websiteUrl: "javascript:alert(1)" },
    { email: "not-an-email" },
  ]) {
    assert.ok(validateProfileCustomization(body).error, JSON.stringify(body));
  }
});
