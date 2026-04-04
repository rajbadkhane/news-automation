import {
  getAdminMasterApiKey,
  getAdminPanelPassword,
  getAdminSessionSecret,
  getPublicApiBaseUrl,
} from "@/lib/runtime-env";

export const ADMIN_API_BASE_URL = getPublicApiBaseUrl();

export const ADMIN_MASTER_API_KEY = getAdminMasterApiKey();

export const ADMIN_PANEL_PASSWORD = getAdminPanelPassword();

export const ADMIN_PANEL_SESSION_SECRET = getAdminSessionSecret();

export const ADMIN_SESSION_COOKIE = "gts_admin_session";
