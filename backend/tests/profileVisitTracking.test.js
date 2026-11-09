import assert from "node:assert/strict";
import test from "node:test";
import { canCustomizeProfile } from "../src/services/profileValidation.js";
import {
  createProfileStatisticsHandler,
  createPublicVisitHandler,
  getVisitPeriodBounds,
} from "../src/services/profileVisitTracking.js";

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end() { this.ended = true; return this; },
  };
}

test("South African reporting periods use local midnight and Monday-to-Sunday weeks", () => {
  const beforeMidnight = getVisitPeriodBounds(new Date("2026-11-08T21:59:59.000Z"));
  assert.equal(beforeMidnight.today.start.toISOString(), "2026-11-07T22:00:00.000Z");
  assert.equal(beforeMidnight.today.end.toISOString(), "2026-11-08T22:00:00.000Z");
  assert.equal(beforeMidnight.thisWeek.start.toISOString(), "2026-11-01T22:00:00.000Z");
  assert.equal(beforeMidnight.thisWeek.end.toISOString(), "2026-11-08T22:00:00.000Z");
  assert.equal(beforeMidnight.thisMonth.start.toISOString(), "2026-10-31T22:00:00.000Z");
  assert.equal(beforeMidnight.thisMonth.end.toISOString(), "2026-11-30T22:00:00.000Z");
  assert.equal(beforeMidnight.thisYear.start.toISOString(), "2025-12-31T22:00:00.000Z");
  assert.equal(beforeMidnight.thisYear.end.toISOString(), "2026-12-31T22:00:00.000Z");

  const afterMidnight = getVisitPeriodBounds(new Date("2026-11-08T22:00:00.000Z"));
  assert.equal(afterMidnight.today.start.toISOString(), "2026-11-08T22:00:00.000Z");
  assert.equal(afterMidnight.thisWeek.start.toISOString(), "2026-11-08T22:00:00.000Z");
  assert.equal(afterMidnight.thisWeek.end.toISOString(), "2026-11-15T22:00:00.000Z");
});

test("failed public profile lookups are not counted", async () => {
  let recorded = 0;
  const handler = createPublicVisitHandler({
    async findProfile() { return null; },
    async recordVisit() { recorded += 1; },
  });
  const response = responseRecorder();
  await handler({ params: { publicId: "missing" } }, response);
  assert.equal(response.statusCode, 404);
  assert.equal(recorded, 0);
});

test("successful profile loads record a visit without returning private profile data", async () => {
  let recordedProfileId;
  const handler = createPublicVisitHandler({
    async findProfile() { return { id: "profile-1" }; },
    async recordVisit(profileId) { recordedProfileId = profileId; },
  });
  const response = responseRecorder();
  await handler({ params: { publicId: "LB001" } }, response);
  assert.equal(response.statusCode, 204);
  assert.equal(recordedProfileId, "profile-1");
  assert.equal(response.payload, undefined);
});

test("statistics allow admins and only the assigned customer", async () => {
  const profile = { id: "profile-1", userId: "customer-1", visitCount: 42 };
  const calls = [];
  const handler = createProfileStatisticsHandler({
    async findProfile() { return profile; },
    canViewProfile: canCustomizeProfile,
    async countVisits(profileId, start, end) {
      calls.push({ profileId, start, end });
      return 3;
    },
  });

  const adminResponse = responseRecorder();
  await handler({ params: { publicId: "LB001" }, user: { id: "admin", role: "ADMIN" } }, adminResponse);
  assert.equal(adminResponse.statusCode, 200);
  assert.deepEqual(adminResponse.payload, {
    today: 3,
    thisWeek: 3,
    thisMonth: 3,
    thisYear: 3,
    total: 42,
  });
  assert.equal(calls.length, 4);

  calls.length = 0;
  const assignedResponse = responseRecorder();
  await handler({ params: { publicId: "LB001" }, user: { id: "customer-1", role: "CUSTOMER" } }, assignedResponse);
  assert.equal(assignedResponse.statusCode, 200);

  calls.length = 0;
  const otherResponse = responseRecorder();
  await handler({ params: { publicId: "LB001" }, user: { id: "customer-2", role: "CUSTOMER" } }, otherResponse);
  assert.equal(otherResponse.statusCode, 403);
  assert.equal(calls.length, 0);
});
