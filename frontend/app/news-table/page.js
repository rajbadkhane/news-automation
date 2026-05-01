import NewsTableDesk from "@/components/news-table-desk";
import { getAdminMasterApiKey, getPublicApiBaseUrl } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const API_BASE_URL = getPublicApiBaseUrl();
const ADMIN_MASTER_API_KEY = getAdminMasterApiKey();

function getRecordTime(record) {
  const timestamp = new Date(record?.fetched_at || record?.published_at || record?.updated_at || 0).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getRecordId(record) {
  return Number(record?.rewrite_id || record?.id || 0) || 0;
}

function sortNewestFirst(records) {
  return [...records].sort((left, right) => {
    const timeDiff = getRecordTime(right) - getRecordTime(left);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return getRecordId(right) - getRecordId(left);
  });
}

function normalizeTablePayload(payload) {
  if (payload?.success) {
    const groups = Array.isArray(payload.data) ? payload.data : [];
    const groupedRecords = groups.map((group) => ({
      category: group.category,
      count: group.records?.length || group.published_count || group.count || 0,
      records: sortNewestFirst((group.records || []).map((item) => ({
        id: item.news_id || item.id,
        rewrite_id: item.id,
        category: item.ui_hindi?.category || item.category || group.category,
        title: item.ui_hindi?.title || item.article?.headline || item.source?.title || "Untitled story",
        source_url: item.link || item.source?.url || "",
        image_link: item.ui_hindi?.image_url || item.media?.image_link || "",
        fetched_at: item.source?.fetched_at || item.published_at || item.updated_at,
        feed_source: item.source?.feed_source || item.source?.title || "published",
        ui_hindi: item.ui_hindi || null,
        raw_articles: item.raw_articles || null,
      }))),
    }));

    return {
      status: "Success",
      count: payload.meta?.count || 0,
      category_count: payload.meta?.category_count || groupedRecords.length,
      grouped_records: groupedRecords,
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

    return normalizeTablePayload(await response.json());
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

export default async function NewsTablePage() {
  const initialPayload = await getNewsFeed();

  return <NewsTableDesk initialPayload={initialPayload} />;
}
