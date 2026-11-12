import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PDF_DISPLAY_NAME_INPUT,
  toPdfDisplayNameInput,
  validatePdfDisplayNameInput,
} from "../src/utils/pdfDisplayName.js";

test("editor displays saved PDF names without one or repeated extensions", () => {
  assert.equal(toPdfDisplayNameInput("LinkBase-profile.pdf"), "LinkBase-profile");
  assert.equal(toPdfDisplayNameInput("report.pdf.PDF"), "report");
  assert.equal(toPdfDisplayNameInput(null), DEFAULT_PDF_DISPLAY_NAME_INPUT);
});

test("editor validates trimmed base names from 1 through 120 characters", () => {
  assert.deepEqual(validatePdfDisplayNameInput("  My document  "), { value: "My document" });
  assert.deepEqual(validatePdfDisplayNameInput("x".repeat(120)), { value: "x".repeat(120) });
  assert.deepEqual(validatePdfDisplayNameInput("x".repeat(121)), {
    error: "PDF display name must be between 1 and 120 characters",
  });
  assert.match(validatePdfDisplayNameInput("").error, /1 and 120/);
  assert.match(validatePdfDisplayNameInput("   ").error, /1 and 120/);
  assert.deepEqual(validatePdfDisplayNameInput("report.pdf.pdf"), { value: "report" });
});
