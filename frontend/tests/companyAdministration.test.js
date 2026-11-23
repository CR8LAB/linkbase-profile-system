import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

test("the shared editor and navigation show the company administrator's allowed controls", async () => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [react()],
    server: { middlewareMode: true },
  });
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  try {
    const { default: ProfileCustomizationFields } = await vite.ssrLoadModule("/src/pages/ProfileCustomizationFields.jsx");
    const { default: App } = await vite.ssrLoadModule("/src/App.jsx");
    const render = (Component, props, path = "/") => renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(Component, props)),
    );
    const profile = { publicId: "fixture", fullName: "Fixture Profile", socialLinks: [] };
    const editor = render(ProfileCustomizationFields, { profile, adminFields: true });
    for (const input of [
      "profile-image-file", "company-logo-file", "profile-background-image", "profile-pdf-file",
      "fontFamily", "bodyTextColor", "backgroundColor", "buttonColor", "buttonTextColor",
      "saveContactButtonColor", "saveContactButtonTextColor", "socialLinkBackgroundColor", "socialLinkIconColor",
      "businessAddress", "googleReviewUrl",
    ]) assert.ok(editor.includes(`id="${input}"`), input);

    const sessionAs = (role) => {
      const payload = btoa(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 60 }));
      Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true,
        value: { getItem: () => `fixture.${payload}.signature` },
      });
    };
    sessionAs("COMPANY_ADMIN");
    const dashboard = render(App, null, "/admin");
    assert.match(dashboard, /Company profiles/);
    assert.doesNotMatch(dashboard, /Create Profile|\/admin\/companies|\/admin\/customers/);
    assert.doesNotMatch(render(App, null, "/admin/profiles/create"), /Create a New Profile/);
    assert.match(render(App, null, "/admin/profiles/fixture/edit"), /Loading profile/);

    sessionAs("ADMIN");
    assert.match(render(App, null, "/admin/profiles/create"), /Create a New Profile/);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else delete globalThis.sessionStorage;
    await vite.close();
  }
});
