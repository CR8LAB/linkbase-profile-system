import prisma from "../config/prisma.js";
import { isValidShortCode } from "../services/shortCode.js";

export function createShortUrlHandlers(
  profileLookup,
  publicAppUrl = process.env.PUBLIC_APP_URL || "http://localhost:5173",
) {
  async function findProfile(shortCode) {
    if (!isValidShortCode(shortCode)) return null;
    return profileLookup(shortCode.toLowerCase());
  }

  async function resolveShortCode(req, res) {
    try {
      const profile = await findProfile(req.params.shortCode);
      if (!profile) {
        return res.status(404).json({ message: "Short link not found" });
      }

      return res.status(200).json({
        path: `/profile/${encodeURIComponent(profile.publicId)}`,
      });
    } catch (error) {
      console.error("Short link lookup failed:", error);
      return res.status(500).json({ message: "Could not resolve short link" });
    }
  }

  async function redirectShortCode(req, res) {
    try {
      const profile = await findProfile(req.params.shortCode);
      if (!profile) return res.status(404).send("Short link not found");

      const destination = new URL(
        `/profile/${encodeURIComponent(profile.publicId)}`,
        publicAppUrl,
      );

      return res.redirect(302, destination.toString());
    } catch (error) {
      console.error("Short link redirect failed:", error);
      return res.status(500).send("Could not resolve short link");
    }
  }

  return { resolveShortCode, redirectShortCode };
}

const handlers = createShortUrlHandlers((shortCode) =>
  prisma.profile.findUnique({
    where: { shortCode },
    select: { publicId: true },
  }),
);

export const { resolveShortCode, redirectShortCode } = handlers;
