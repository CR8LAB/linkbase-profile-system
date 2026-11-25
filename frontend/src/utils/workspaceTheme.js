import { createContext } from "react";

const storageKey = "linkbase:workspace-theme";

export const WorkspaceThemeContext = createContext(null);

export function getWorkspaceTheme() {
  try {
    return globalThis.localStorage?.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveWorkspaceTheme(theme) {
  try {
    globalThis.localStorage?.setItem(storageKey, theme);
  } catch {
    // The workspace can still change theme when storage is unavailable.
  }
}
