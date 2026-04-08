import AiNewsDesk from "@/components/ai-news-desk";
import { getAdminMasterApiKey, getPublicApiBaseUrl } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const API_BASE_URL = getPublicApiBaseUrl();
const ADMIN_MASTER_API_KEY = getAdminMasterApiKey();

function normalizeAiGroupedPayload(payload) {
  if (payload?.success) {
    return {
      status: "Success",
      grouped_records: payload.data || [],
      count: payload.meta?.count || 0,
      category_count: payload.meta?.category_count || 0,
    };
  }

  return {
    status: "Error",
    grouped_records: [],
    message: payload?.error?.message || "Backend response was invalid.",
  };
}

function normalizeAiCronPayload(payload) {
  if (payload?.success) {
    return {
      status: "Success",
      scheduler: payload.data || null,
    };
  }

  return {
    status: "Error",
    scheduler: null,
    message: payload?.error?.message || "Backend response was invalid.",
  };
}

async function getAiNewsFeed() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/ai/news/grouped?limit=100`, {
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`AI backend responded with ${response.status}`);
    }

    return normalizeAiGroupedPayload(await response.json());
  } catch (error) {
    return {
      status: "Error",
      grouped_records: [],
      message: error.message,
    };
  }
}

async function getAiCronStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/ai/cron/status`, {
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`AI cron API responded with ${response.status}`);
    }

    return normalizeAiCronPayload(await response.json());
  } catch (error) {
    return {
      status: "Error",
      scheduler: null,
      message: error.message,
    };
  }
}

export default async function AiPage() {
  const [aiPayload, aiCronPayload] = await Promise.all([getAiNewsFeed(), getAiCronStatus()]);

  return (
    <AiNewsDesk
      aiPayload={aiPayload}
      aiCronPayload={aiCronPayload}
    />
  );
}
