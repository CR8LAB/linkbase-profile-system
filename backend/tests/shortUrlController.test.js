import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createShortUrlHandlers } from "../src/controllers/shortUrlController.js";

async function startServer(
  profileLookup,
  publicAppUrl = "https://app.linkbase.co.za",
  isProduction = false,
) {
  const { redirectShortCode, resolveShortCode } =
    createShortUrlHandlers(profileLookup, publicAppUrl, isProduction);
  const app = express();
  app.get("/api/short-links/:shortCode", resolveShortCode);
  app.get("/:shortCode", redirectShortCode);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test("short link resolver returns only the associated local profile path", async (context) => {
  const { server, baseUrl } = await startServer(async (shortCode) =>
    shortCode === "a7c29c3d4e5f" ? { publicId: "LB0099" } : null,
  );
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/api/short-links/a7c29c3d4e5f`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: "/profile/LB0099" });
});

test("short link redirects assigned codes to an HTTPS public profile URL", async (context) => {
  const { server, baseUrl } = await startServer(async (shortCode) =>
    shortCode === "a7c29c3d4e5f" ? { publicId: "LB0099" } : null,
  );
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/a7c29c3d4e5f`, {
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  assert.equal(
    response.headers.get("location"),
    "https://app.linkbase.co.za/profile/LB0099",
  );
});

test("production short-link redirects reject an HTTP destination before profile lookup", async (context) => {
  let lookupCount = 0;
  const { server, baseUrl } = await startServer(async () => {
    lookupCount += 1;
    return { publicId: "LB0099" };
  }, "http://app.example.com", true);
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/a7c29c3d4e5f`, { redirect: "manual" });
  assert.equal(response.status, 500);
  assert.equal(lookupCount, 0);
});

test("development short-link redirects retain localhost HTTP support", async (context) => {
  const { server, baseUrl } = await startServer(
    async () => ({ publicId: "LB0099" }),
    "http://localhost:5173",
    false,
  );
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`${baseUrl}/a7c29c3d4e5f`, { redirect: "manual" });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "http://localhost:5173/profile/LB0099");
});

test("malformed and unknown short codes return 404 safely", async (context) => {
  let lookupCount = 0;
  const { server, baseUrl } = await startServer(async () => {
    lookupCount += 1;
    return null;
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const malformedResponse = await fetch(`${baseUrl}/not-a-code`, {
    redirect: "manual",
  });
  const unknownResponse = await fetch(`${baseUrl}/a7c29c3d4e5f`, {
    redirect: "manual",
  });

  assert.equal(malformedResponse.status, 404);
  assert.equal(unknownResponse.status, 404);
  assert.equal(lookupCount, 1);
});
