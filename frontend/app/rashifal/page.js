import NewsTableDesk from "@/components/news-table-desk";
import { getAdminMasterApiKey, getServerApiBaseUrl } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const API_BASE_URL = getServerApiBaseUrl();
const ADMIN_MASTER_API_KEY = getAdminMasterApiKey();

function normalizeSectionPayload(payload) {
  if (payload?.success) {
    return {
      status: "Success",
      count: payload.meta?.count || 0,
      category_count: payload.meta?.category_count || 0,
      grouped_records: Array.isArray(payload.data) ? payload.data : [],
      loaded_at: new Date().toISOString(),
    };
  }

  return {
    status: "Error",
    count: 0,
    category_count: 0,
    grouped_records: [],
    message: payload?.error?.message || "Backend response was invalid.",
    loaded_at: new Date().toISOString(),
  };
}

async function getRashifalFeed() {
  try {
    await fetch(`${API_BASE_URL}/api/v1/sync/rashifal?limit=50`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    }).catch(() => null);

    const response = await fetch(`${API_BASE_URL}/api/v1/rashifal/grouped?limit=50`, {
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    return normalizeSectionPayload(await response.json());
  } catch (error) {
    return {
      status: "Error",
      count: 0,
      category_count: 0,
      grouped_records: [],
      message: error.message,
      loaded_at: new Date().toISOString(),
    };
  }
}

export default async function RashifalPage() {
  const initialPayload = await getRashifalFeed();

  return <NewsTableDesk initialPayload={initialPayload} initialSection="rashifal" />;
}
