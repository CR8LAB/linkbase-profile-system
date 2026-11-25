import assert from "node:assert/strict";
import test from "node:test";
import { getWorkspaceTheme, saveWorkspaceTheme } from "../src/utils/workspaceTheme.js";

test("workspace theme defaults to light, restores the stored selection and tolerates blocked storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const valueByKey = new Map();
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key) => valueByKey.get(key),
        setItem: (key, value) => valueByKey.set(key, value),
      },
    });
    assert.equal(getWorkspaceTheme(), "light");
    saveWorkspaceTheme("dark");
    assert.equal(getWorkspaceTheme(), "dark");
    saveWorkspaceTheme("light");
    assert.equal(getWorkspaceTheme(), "light");
    valueByKey.set("linkbase:workspace-theme", "invalid");
    assert.equal(getWorkspaceTheme(), "light");

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() { throw new Error("Storage blocked"); },
    });
    assert.equal(getWorkspaceTheme(), "light");
    assert.doesNotThrow(() => saveWorkspaceTheme("dark"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
