import NewsDashboard from "@/components/news-dashboard";
import { getAdminMasterApiKey, getPublicApiBaseUrl } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const API_BASE_URL = getPublicApiBaseUrl();
const ADMIN_MASTER_API_KEY = getAdminMasterApiKey();

function normalizeDashboardListPayload(payload) {
  if (payload?.success) {
    const groups = Array.isArray(payload.data) ? payload.data : [];
    const groupedRecords = groups.map((group) => ({
      category: group.category,
      count: group.records?.length || group.published_count || group.count || 0,
      records: (group.records || []).map((item) => ({
        id: item.news_id || item.id,
        rewrite_id: item.id,
        category: item.category || group.category,
        title: item.ui_hindi?.title || item.article?.headline || item.source?.title || "Untitled story",
        source_url: item.link || item.source?.url || "",
        image_link: item.ui_hindi?.image_url || item.media?.image_link || "",
        image_source: item.media?.image_source || "article-image",
        fetched_at: item.source?.fetched_at || item.published_at || item.updated_at,
        feed_source: item.source?.feed_source || item.source?.title || "published",
        feed_url: item.source?.feed_url || "",
        ui_hindi: item.ui_hindi || null,
        raw_articles: item.raw_articles || null,
        article: item.article || null,
      })),
    }));

    return {
      status: "Success",
      database: payload.database || payload.meta?.database || null,
      count: payload.meta?.count || 0,
      category_count: payload.meta?.category_count || groupedRecords.length,
      grouped_records: groupedRecords,
    };
  }

  return {
    status: "Error",
    database: null,
    count: 0,
    grouped_records: [],
    message: payload?.error?.message || "Backend response was invalid.",
  };
}

function normalizeSchedulerPayload(payload) {
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

function normalizeSchedulerLogsPayload(payload) {
  if (payload?.success) {
    return {
      status: "Success",
      records: payload.data || [],
      count: payload.meta?.count || 0,
    };
  }

  return {
    status: "Error",
    records: [],
    message: payload?.error?.message || "Backend response was invalid.",
  };
}

async function getNewsFeed() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/delivery/news/grouped?language=hindi&limit=500`, {
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    return normalizeDashboardListPayload(await response.json());
  } catch (error) {
    return {
      status: "Error",
      count: 0,
      grouped_records: [],
      message: error.message,
    };
  }
}

async function getCronStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/cron/status`, {
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Cron API responded with ${response.status}`);
    }

    return normalizeSchedulerPayload(await response.json());
  } catch (error) {
    return {
      status: "Error",
      scheduler: null,
      message: error.message,
    };
  }
}

async function getSchedulerLogs() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/scheduler/logs?limit=20`, {
      cache: "no-store",
      headers: {
        "x-api-key": ADMIN_MASTER_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Scheduler logs API responded with ${response.status}`);
    }

    return normalizeSchedulerLogsPayload(await response.json());
  } catch (error) {
    return {
      status: "Error",
      records: [],
      message: error.message,
    };
  }
}

export default async function HomePage() {
  const [payload, cronPayload, schedulerLogPayload] = await Promise.all([
    getNewsFeed(),
    getCronStatus(),
    getSchedulerLogs(),
  ]);

  return (
    <NewsDashboard
      initialPayload={payload}
      cronPayload={cronPayload}
      initialSchedulerLogPayload={schedulerLogPayload}
    />
  );
}
