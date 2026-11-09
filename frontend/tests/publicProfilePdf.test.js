import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MemoryRouter } from "react-router-dom";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

test("public profile shows Download PDF only when a PDF is present", async () => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [react()],
    server: { middlewareMode: true },
  });
  try {
    const { default: PublicProfileCard } = await vite.ssrLoadModule("/src/pages/PublicProfileCard.jsx");
    const render = (pdfUrl) => renderToStaticMarkup(
      React.createElement(MemoryRouter, null,
        React.createElement(PublicProfileCard, {
          profile: { fullName: "Test User", publicId: "test", pdfUrl, socialLinks: [] },
        }),
      ),
    );
    assert.match(render("/api/profiles/test/pdf/download"), /Download PDF/);
    assert.doesNotMatch(render(null), /Download PDF/);
  } finally {
    await vite.close();
  }
});
