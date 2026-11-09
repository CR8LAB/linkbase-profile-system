import assert from "node:assert/strict";
import test from "node:test";
import { shouldRecordLocationVisit } from "../src/utils/locationVisitGuard.js";

test("the same router location is counted once across StrictMode effect reruns", () => {
  const locationKey = "page-load-1";
  let lastTrackedLocation = null;
  assert.equal(shouldRecordLocationVisit(lastTrackedLocation, locationKey), true);
  lastTrackedLocation = locationKey;
  assert.equal(shouldRecordLocationVisit(lastTrackedLocation, locationKey), false);
  assert.equal(shouldRecordLocationVisit(lastTrackedLocation, "page-load-2"), true);
});
