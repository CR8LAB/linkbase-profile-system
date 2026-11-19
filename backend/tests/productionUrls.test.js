import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionUrlConfig } from "../src/config/productionUrls.js";

test("production requires an HTTPS public URL and explicit HTTPS frontend origins", () => {
  const valid = {
    NODE_ENV: "production",
    PUBLIC_APP_URL: "https://app.example.com",
    FRONTEND_ORIGINS: "https://app.example.com,https://admin.example.com",
  };
  assert.deepEqual(validateProductionUrlConfig(valid), {
    publicAppUrl: "https://app.example.com",
    frontendOrigins: ["https://app.example.com", "https://admin.example.com"],
  });

  assert.throws(
    () => validateProductionUrlConfig({ ...valid, PUBLIC_APP_URL: undefined }),
    /PUBLIC_APP_URL is required/,
  );
  assert.throws(
    () => validateProductionUrlConfig({ ...valid, PUBLIC_APP_URL: "http://app.example.com" }),
    /HTTPS origins/,
  );
  assert.throws(
    () => validateProductionUrlConfig({ ...valid, FRONTEND_ORIGINS: undefined }),
    /FRONTEND_ORIGINS is required/,
  );
  assert.throws(
    () => validateProductionUrlConfig({ ...valid, FRONTEND_ORIGINS: "https://app.example.com,http://admin.example.com" }),
    /HTTPS origins/,
  );
  assert.throws(
    () => validateProductionUrlConfig({ ...valid, FRONTEND_ORIGINS: "https://app.example.com/*" }),
    /HTTPS origins/,
  );
  assert.throws(
    () => validateProductionUrlConfig({ ...valid, FRONTEND_ORIGINS: "https://app.example.com/path" }),
    /HTTPS origins/,
  );
});

test("development retains localhost defaults and accepts local HTTP configuration", () => {
  assert.deepEqual(validateProductionUrlConfig({ NODE_ENV: "development" }), {
    publicAppUrl: "http://localhost:5173",
    frontendOrigins: ["http://localhost:5173", "http://127.0.0.1:4173"],
  });
  assert.deepEqual(
    validateProductionUrlConfig({
      NODE_ENV: "test",
      PUBLIC_APP_URL: "http://localhost:5173/",
      FRONTEND_ORIGINS: "http://localhost:5173",
    }),
    { publicAppUrl: "http://localhost:5173/", frontendOrigins: ["http://localhost:5173"] },
  );
});
