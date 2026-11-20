import assert from "node:assert/strict";
import test from "node:test";
import { validateProfileBackgroundImage } from "../src/services/profileBackgroundImage.js";

function imageFile(mimetype, buffer) {
  return { mimetype, buffer, size: buffer.length };
}

test("background uploads accept JPEG, PNG and WebP with matching signatures", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = Buffer.from("RIFF0000WEBP");
  assert.equal(validateProfileBackgroundImage(imageFile("image/jpeg", jpeg)), null);
  assert.equal(validateProfileBackgroundImage(imageFile("image/png", png)), null);
  assert.equal(validateProfileBackgroundImage(imageFile("image/webp", webp)), null);
});

test("background uploads reject unsupported and mismatched file types", () => {
  assert.match(validateProfileBackgroundImage(imageFile("image/gif", Buffer.from("GIF89a"))), /Only JPEG, PNG and WebP/);
  assert.match(validateProfileBackgroundImage(imageFile("image/png", Buffer.from("not a PNG"))), /content does not match/);
});

test("background uploads reject files larger than five megabytes", () => {
  const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
  assert.match(validateProfileBackgroundImage(imageFile("image/png", buffer)), /5 MB or smaller/);
});
