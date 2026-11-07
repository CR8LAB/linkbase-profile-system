export const profileFontFamilies = ["Raleway", "Arial", "Roboto", "Montserrat"];

export const profileCustomizationFields = [
  "fullName",
  "jobTitle",
  "email",
  "phone",
  "websiteUrl",
  "fontFamily",
  "bodyTextColor",
  "backgroundColor",
  "buttonColor",
  "buttonTextColor",
  "saveContactButtonColor",
  "saveContactButtonTextColor",
  "socialLinkBackgroundColor",
  "socialLinkIconColor",
];

export const customerProfileCustomizationFields = [
  "fullName",
  "jobTitle",
  "email",
  "phone",
  "websiteUrl",
  "fontFamily",
  "bodyTextColor",
  "backgroundColor",
  "buttonColor",
  "buttonTextColor",
  "saveContactButtonColor",
  "saveContactButtonTextColor",
  "socialLinkBackgroundColor",
  "socialLinkIconColor",
];

export function canCustomizeProfile(user, profile) {
  return (
    user?.role === "ADMIN" ||
    (user?.role === "CUSTOMER" && user.id === profile?.userId)
  );
}

const colorFields = [
  "bodyTextColor",
  "backgroundColor",
  "buttonColor",
  "buttonTextColor",
  "saveContactButtonColor",
  "saveContactButtonTextColor",
  "socialLinkBackgroundColor",
  "socialLinkIconColor",
];

export function validateProfileCustomization(
  body = {},
  allowedFields = profileCustomizationFields,
) {
  const updates = {};
  const allowed = new Set(allowedFields);

  for (const field of profileCustomizationFields) {
    if (Object.hasOwn(body, field) && !allowed.has(field)) {
      return { error: `${field} cannot be changed by this user` };
    }
  }

  for (const field of allowedFields) {
    if (!Object.hasOwn(body, field)) continue;

    const value = body[field];

    if (field === "fullName") {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        value.trim().length > 120
      ) {
        return { error: "Full name must be between 1 and 120 characters" };
      }
      updates[field] = value.trim();
      continue;
    }

    if (colorFields.includes(field)) {
      if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) {
        return { error: `${field} must be a six-digit hex color` };
      }
      updates[field] = value.toLowerCase();
      continue;
    }

    if (field === "fontFamily") {
      if (!profileFontFamilies.includes(value)) {
        return { error: "Font family is not supported" };
      }
      updates[field] = value;
      continue;
    }

    if (typeof value !== "string" && value !== null) {
      return { error: `${field} must be text` };
    }

    const text = value ?? "";

    if (field === "email" && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return { error: "Email address is invalid" };
    }

    if (field === "websiteUrl" && text) {
      try {
        const url = new URL(text);
        if (!["http:", "https:"].includes(url.protocol)) {
          return { error: "Website must use HTTP or HTTPS" };
        }
      } catch {
        return { error: "Website URL is invalid" };
      }
    }

    if (text.length > (field === "email" ? 254 : 500)) {
      return { error: `${field} is too long` };
    }

    updates[field] = text.trim();
  }

  return { updates };
}
