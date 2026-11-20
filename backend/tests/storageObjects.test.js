import assert from "node:assert/strict";
import test from "node:test";
import {
  getProfileBackgroundObjectName,
  getProfileMediaObjects,
  isGeneratedProfileObjectName,
} from "../src/services/storageObjects.js";

const bucketName = "linkbase-test-bucket";

test("background image object parsing is scoped to the profile and generated image names", () => {
  const objectName = "profiles/LBTEST/background/123e4567-e89b-12d3-a456-426614174000.webp";
  const url = `https://storage.googleapis.com/${bucketName}/${objectName}`;
  assert.equal(getProfileBackgroundObjectName(url, bucketName, "LBTEST"), objectName);
  assert.equal(getProfileBackgroundObjectName(url, bucketName, "OTHER"), null);
  assert.equal(getProfileBackgroundObjectName("https://example.com/evil.png", bucketName, "LBTEST"), null);
  assert.equal(isGeneratedProfileObjectName(objectName), true);
  assert.equal(isGeneratedProfileObjectName("profiles/LBTEST/background/custom.png"), false);
});

test("profile media cleanup includes only the generated background object", () => {
  const profile = {
    id: "profile-db-id",
    publicId: "LBTEST",
    backgroundImageUrl: `https://storage.googleapis.com/${bucketName}/profiles/LBTEST/background/123e4567-e89b-12d3-a456-426614174000.png`,
    photoUrl: null,
    logoUrl: null,
    pdfUrl: null,
  };
  assert.deepEqual(getProfileMediaObjects(profile, bucketName), [{
    bucketName,
    objectName: "profiles/LBTEST/background/123e4567-e89b-12d3-a456-426614174000.png",
  }]);
});
