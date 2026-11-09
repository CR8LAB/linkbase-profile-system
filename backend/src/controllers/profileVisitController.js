import prisma from "../config/prisma.js";
import { canCustomizeProfile } from "../services/profileValidation.js";
import {
  createProfileStatisticsHandler,
  createPublicVisitHandler,
} from "../services/profileVisitTracking.js";

export const recordPublicProfileVisit = createPublicVisitHandler({
  findProfile: (publicId) =>
    prisma.profile.findUnique({ where: { publicId }, select: { id: true } }),
  recordVisit: async (profileId) => {
    await prisma.$transaction([
      prisma.profileVisit.create({ data: { profileId } }),
      prisma.profile.update({
        where: { id: profileId },
        data: { visitCount: { increment: 1 } },
      }),
    ]);
  },
});

export const getProfileVisitStatistics = createProfileStatisticsHandler({
  findProfile: (publicId) =>
    prisma.profile.findUnique({
      where: { publicId },
      select: { id: true, userId: true, visitCount: true },
    }),
  canViewProfile: canCustomizeProfile,
  countVisits: (profileId, start, end) =>
    prisma.profileVisit.count({
      where: { profileId, createdAt: { gte: start, lt: end } },
    }),
});
