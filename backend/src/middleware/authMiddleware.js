import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import { getJwtConfig } from "../config/jwt.js";
import { currentSessionTime, getSessionTimes } from "../services/authSession.js";

// Authenticate

export function createAuthenticate(database = prisma, jwtConfigProvider = getJwtConfig) {
  return async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    let jwtConfig;
    try {
      jwtConfig = jwtConfigProvider();
    } catch {
      return res.status(500).json({
        message: "Authentication configuration error",
      });
    }

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const token = authHeader.slice(7);

    let decoded;
    const now = currentSessionTime();

    try {
      decoded = jwt.verify(token, jwtConfig.secret, {
        algorithms: [jwtConfig.algorithm],
        clockTimestamp: now,
      });
    } catch (error) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    const session = getSessionTimes(decoded, now);
    if (!session || !Number.isSafeInteger(decoded.tokenVersion) || decoded.tokenVersion < 0) {
      return res.status(401).json({
        message: "Invalid or expired token",
      });
    }

    try {
      const user = await database.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          role: true,
          companyId: true,
          tokenVersion: true,
        },
      });

      if (!user) {
        return res.status(401).json({
          message: "User account no longer exists",
        });
      }

      if (decoded.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({
          message: "Invalid or expired token",
        });
      }

      req.user = {
        id: user.id,
        role: user.role,
        ...(user.role === "COMPANY_ADMIN" && { companyId: user.companyId }),
      };

      req.authSession = { ...session, tokenVersion: user.tokenVersion };
      return next();
    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: "Authentication failed",
      });
    }
  };
}

export const authenticate = createAuthenticate();
// Authorize
export function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({
      message: "Administrator access required",
    });
  }

  next();
}

export function requireProfileAdministrator(req, res, next) {
  if (!["ADMIN", "COMPANY_ADMIN"].includes(req.user?.role)) {
    return res.status(403).json({ message: "Administrator access required" });
  }
  return next();
}
