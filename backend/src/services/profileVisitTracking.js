const REPORTING_TIME_ZONE = "Africa/Johannesburg";

function getZonedParts(date, timeZone = REPORTING_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function getOffsetMilliseconds(date, timeZone) {
  const parts = getZonedParts(date, timeZone);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ) - Math.floor(date.getTime() / 1000) * 1000;
}

function localMidnightToUtc(year, month, day, timeZone = REPORTING_TIME_ZONE) {
  const localAsUtc = Date.UTC(year, month - 1, day);
  let utcGuess = localAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    utcGuess = localAsUtc - getOffsetMilliseconds(new Date(utcGuess), timeZone);
  }
  return new Date(utcGuess);
}

function addCalendarDays(year, month, day, numberOfDays) {
  const date = new Date(Date.UTC(year, month - 1, day + numberOfDays));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

export function getVisitPeriodBounds(now = new Date()) {
  const { year, month, day } = getZonedParts(now);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const [weekStartYear, weekStartMonth, weekStartDay] = addCalendarDays(
    year,
    month,
    day,
    -daysSinceMonday,
  );
  const [nextWeekYear, nextWeekMonth, nextWeekDay] = addCalendarDays(
    weekStartYear,
    weekStartMonth,
    weekStartDay,
    7,
  );

  return {
    today: {
      start: localMidnightToUtc(year, month, day),
      end: localMidnightToUtc(...addCalendarDays(year, month, day, 1)),
    },
    thisWeek: {
      start: localMidnightToUtc(weekStartYear, weekStartMonth, weekStartDay),
      end: localMidnightToUtc(nextWeekYear, nextWeekMonth, nextWeekDay),
    },
    thisMonth: {
      start: localMidnightToUtc(year, month, 1),
      end: month === 12
        ? localMidnightToUtc(year + 1, 1, 1)
        : localMidnightToUtc(year, month + 1, 1),
    },
    thisYear: {
      start: localMidnightToUtc(year, 1, 1),
      end: localMidnightToUtc(year + 1, 1, 1),
    },
  };
}

export function createPublicVisitHandler({ findProfile, recordVisit }) {
  return async function recordPublicVisit(req, res) {
    try {
      const profile = await findProfile(req.params.publicId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      await recordVisit(profile.id);
      return res.status(204).end();
    } catch (error) {
      console.error("Profile visit recording failed:", error);
      return res.status(500).json({ message: "Could not record profile visit" });
    }
  };
}

export function createProfileStatisticsHandler({
  findProfile,
  countVisits,
  canViewProfile,
}) {
  return async function getProfileStatistics(req, res) {
    try {
      const profile = await findProfile(req.params.publicId);
      if (!profile) return res.status(404).json({ message: "Profile not found" });
      if (!canViewProfile(req.user, profile)) {
        return res.status(403).json({ message: "You cannot view this profile's statistics" });
      }

      const bounds = getVisitPeriodBounds();
      const [today, thisWeek, thisMonth, thisYear] = await Promise.all(
        [bounds.today, bounds.thisWeek, bounds.thisMonth, bounds.thisYear].map(
          ({ start, end }) => countVisits(profile.id, start, end),
        ),
      );
      return res.status(200).json({
        today,
        thisWeek,
        thisMonth,
        thisYear,
        total: profile.visitCount,
      });
    } catch (error) {
      console.error("Profile statistics retrieval failed:", error);
      return res.status(500).json({ message: "Could not retrieve profile statistics" });
    }
  };
}

