import { individualClaimWhere } from "./profileAccess.js";

export const profileFontFamilies = ["Raleway", "Arial", "Roboto", "Montserrat"];

export const profileCustomizationFields = [
  "fullName",
  "jobTitle",
  "email",
  "phone",
  "websiteUrl",
  "businessAddress",
  "googleReviewUrl",
  "whatsappNumber",
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

export const profileAccessSelect = {
  userId: true,
  companyId: true,
  company: { select: { centralisedManagement: true } },
};

export function canCustomizeProfile(user, profile) {
  if (user?.role === "ADMIN") return true;
  if (user?.role === "COMPANY_ADMIN") {
    return Boolean(user.companyId && user.companyId === profile?.companyId && profile.company?.centralisedManagement === true);
  }
  return user?.role === "CUSTOMER" && typeof user.id === "string" && user.id === profile?.userId && profile.company?.centralisedManagement !== true;
}

export function profileManagementWhere(user) {
  if (user?.role === "ADMIN") return {};
  if (user?.role === "COMPANY_ADMIN" && user.companyId) {
    return { companyId: user.companyId, company: { is: { centralisedManagement: true } } };
  }
  if (user?.role === "CUSTOMER" && typeof user.id === "string") {
    return {
      userId: user.id,
      ...individualClaimWhere,
    };
  }
  return { id: { in: [] } };
}

export function normalizeWhatsAppNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/[\s().-]/g, "");
  const international = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(international)) return null;
  return international;
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

    if (field === "googleReviewUrl" && text) {
      if (text.length > 2048) {
        return { error: "Google review URL is too long" };
      }
      try {
        const url = new URL(text);
        if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
          return { error: "Google review URL must be a valid HTTPS URL" };
        }
        updates[field] = url.href;
      } catch {
        return { error: "Google review URL must be a valid HTTPS URL" };
      }
      continue;
    }

    if (field === "whatsappNumber") {
      const normalized = normalizeWhatsAppNumber(text);
      if (normalized === null) {
        return { error: "WhatsApp number must include a valid international country code" };
      }
      updates[field] = normalized;
      continue;
    }

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

    const maxLength = field === "email" ? 254 : field === "googleReviewUrl" ? 2048 : 500;
    if (text.length > maxLength) {
      return { error: `${field} is too long` };
    }

    updates[field] = text.trim();
  }

  return { updates };
}
