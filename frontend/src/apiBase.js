import { resolveApiBaseUrl } from "./utils/productionUrlConfig.js";

const viteEnvironment = import.meta.env || {};
const isViteRuntime = typeof import.meta.env !== "undefined";

export const API_BASE_URL = isViteRuntime
  ? resolveApiBaseUrl(viteEnvironment.VITE_API_BASE_URL, viteEnvironment.DEV)
  : "http://localhost:5000";
