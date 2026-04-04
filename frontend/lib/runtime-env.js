const PLACEHOLDER_PATTERNS = [
  "replace-with",
  "change-this",
  "your-",
  "example.com",
  "127.0.0.1",
  "localhost",
];

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function isStrictProductionEnv() {
  return isProduction() && String(process.env.VERCEL || "").trim() === "1";
}

function looksLikePlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function requireEnv(name, { defaultValue = "", minLength = 1, allowPlaceholder = false } = {}) {
  const rawValue = process.env[name];
  const value = String(rawValue ?? defaultValue).trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters long.`);
  }

  if (isStrictProductionEnv() && !allowPlaceholder && looksLikePlaceholder(value)) {
    throw new Error(`${name} must be set to a real production value.`);
  }

  return value;
}

function normalizeBaseUrl(value, name) {
  const normalized = String(value || "").trim().replace(/\/+$/, "");

  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("unsupported protocol");
    }

    if (isStrictProductionEnv() && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")) {
      throw new Error(`${name} cannot point to localhost in production.`);
    }

    return normalized;
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}

export function getPublicApiBaseUrl() {
  const fallback = isStrictProductionEnv() ? "" : "http://127.0.0.1:3000";
  return normalizeBaseUrl(requireEnv("NEXT_PUBLIC_API_BASE_URL", { defaultValue: fallback }), "NEXT_PUBLIC_API_BASE_URL");
}

export function getAdminMasterApiKey() {
  const fallback = isStrictProductionEnv() ? "" : "local-dev-key-for-development-only";
  return requireEnv("ADMIN_PANEL_MASTER_API_KEY", { defaultValue: fallback, minLength: 16 });
}

export function getAdminPanelPassword() {
  const fallback = isStrictProductionEnv() ? "" : "admin123";
  return requireEnv("ADMIN_PANEL_PASSWORD", { defaultValue: fallback, minLength: 8 });
}

export function getAdminSessionSecret() {
  const fallback = isStrictProductionEnv() ? "" : "change-this-admin-session-secret";
  return requireEnv("ADMIN_PANEL_SESSION_SECRET", { defaultValue: fallback, minLength: 32 });
}
