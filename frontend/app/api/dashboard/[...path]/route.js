import { NextResponse } from "next/server";
import { getAdminMasterApiKey, getPublicApiBaseUrl } from "@/lib/runtime-env";

const API_BASE_URL = getPublicApiBaseUrl();
const ADMIN_MASTER_API_KEY = getAdminMasterApiKey();
const DEFAULT_CACHE_SECONDS = 30;

function getCacheSeconds(pathname) {
  const normalized = `/${String(pathname || "").replace(/^\/+/, "")}`;

  if (normalized.startsWith("/image-proxy")) {
    return 60 * 60 * 24;
  }

  if (normalized.startsWith("/cron/status") || normalized.startsWith("/ai/cron/status")) {
    return 15;
  }

  if (normalized.startsWith("/scheduler/logs")) {
    return 20;
  }

  if (normalized.startsWith("/delivery/news/grouped") || normalized.startsWith("/delivery/news")) {
    return 0;
  }

  if (normalized.startsWith("/ai/news/grouped")) {
    return 0;
  }

  if (normalized.startsWith("/editorial/grouped") || normalized.startsWith("/rashifal/grouped")) {
    return 60;
  }

  if (normalized.startsWith("/news/grouped") || normalized.startsWith("/news")) {
    return 30;
  }

  return 0;
}

function buildResponseCacheHeaders(cacheSeconds) {
  if (cacheSeconds <= 0) {
    return "no-store";
  }

  return `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
}

function buildProxyHeaders(request) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");

  if (contentType) {
    headers.set("Content-Type", contentType);
  }

  if (accept) {
    headers.set("Accept", accept);
  }

  headers.set("x-api-key", ADMIN_MASTER_API_KEY);

  return headers;
}

function normalizeDashboardJson(pathname, payload, status) {
  const normalized = `/${String(pathname || "").replace(/^\/+/, "")}`;

  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (!normalized.startsWith("/image-proxy") && "success" in payload) {
    if (!payload.success) {
      return {
        status: "Error",
        message: payload?.error?.message || `Backend request failed with status ${status}.`,
      };
    }

    if (normalized === "/news/grouped") {
      return {
        status: "Success",
        database: payload.database || payload.meta?.database || null,
        grouped_records: payload.data || [],
        count: payload.meta?.count || 0,
        category_count: payload.meta?.category_count || 0,
      };
    }

    if (normalized === "/news") {
      return {
        status: "Success",
        database: payload.database || payload.meta?.database || null,
        records: payload.data || [],
        count: payload.meta?.count || 0,
        category: payload.meta?.category || null,
      };
    }

    if (normalized === "/cron/status" || normalized === "/ai/cron/status") {
      return {
        status: "Success",
        scheduler: payload.data || null,
      };
    }

    if (normalized === "/scheduler/logs") {
      return {
        status: "Success",
        records: payload.data || [],
        count: payload.meta?.count || 0,
      };
    }

    if (normalized === "/ai/news/grouped") {
      return {
        status: "Success",
        database: payload.database || payload.meta?.database || null,
        grouped_records: payload.data || [],
        count: payload.meta?.count || 0,
        category_count: payload.meta?.category_count || 0,
      };
    }

    if (normalized === "/delivery/news/grouped") {
      const groups = Array.isArray(payload.data) ? payload.data : [];
      return {
        status: "Success",
        database: payload.database || payload.meta?.database || null,
        grouped_records: groups.map((group) => ({
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
        })),
        count: payload.meta?.count || 0,
        category_count: payload.meta?.category_count || groups.length,
      };
    }

    if (normalized === "/editorial/grouped" || normalized === "/rashifal/grouped") {
      return {
        status: "Success",
        database: payload.database || payload.meta?.database || null,
        grouped_records: payload.data || [],
        count: payload.meta?.count || 0,
        category_count: payload.meta?.category_count || 0,
        daily_limit: payload.meta?.daily_limit || null,
      };
    }
  }

  return payload;
}

function resolveBackendPath(pathname) {
  const normalized = `/${String(pathname || "").replace(/^\/+/, "")}`;
  const protectedPrefixes = [
    "/news",
    "/news/grouped",
    "/cron/status",
    "/scheduler/logs",
    "/ai/news/grouped",
    "/ai/cron/status",
    "/delivery/news/grouped",
    "/delivery/news",
    "/editorial/grouped",
    "/rashifal/grouped",
    "/sync/editorial",
    "/sync/rashifal",
  ];

  if (normalized === "/image-proxy" || normalized.startsWith("/image-proxy?")) {
    return normalized;
  }

  if (protectedPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}?`))) {
    return `/api/v1${normalized}`;
  }

  return null;
}

async function proxyToBackend(request, { params }) {
  const resolvedParams = typeof params?.then === "function" ? await params : params;
  const pathSegments = Array.isArray(resolvedParams?.path) ? resolvedParams.path : [];
  const url = new URL(request.url);
  const targetPath = pathSegments.join("/");
  const backendPath = resolveBackendPath(targetPath);
  const allowedMethod = request.method === "GET"
    || request.method === "HEAD"
    || (
      request.method === "POST" &&
      (backendPath === "/api/v1/sync/editorial" || backendPath === "/api/v1/sync/rashifal")
    );

  if (!backendPath || !allowedMethod) {
    return NextResponse.json({
      success: false,
      error: {
        code: "DASHBOARD_ROUTE_DISABLED",
        message: "This dashboard action is not available from the public site.",
      },
    }, { status: 403 });
  }

  const targetUrl = `${API_BASE_URL}${backendPath}${url.search}`;
  const cacheSeconds = request.method === "GET" || request.method === "HEAD"
    ? getCacheSeconds(targetPath)
    : 0;

  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.text();

  const backendResponse = await fetch(targetUrl, {
    method: request.method,
    headers: buildProxyHeaders(request),
    cache: cacheSeconds > 0 ? "force-cache" : "no-store",
    ...(cacheSeconds > 0 ? { next: { revalidate: cacheSeconds } } : {}),
    ...(body ? { body } : {}),
  });

  const contentType = backendResponse.headers.get("content-type") || "application/octet-stream";
  const responseCacheControl = buildResponseCacheHeaders(cacheSeconds);

  if (contentType.includes("application/json")) {
    const payload = normalizeDashboardJson(targetPath, await backendResponse.json(), backendResponse.status);

    return NextResponse.json(payload, {
      status: backendResponse.status,
      headers: {
        "Cache-Control": responseCacheControl,
      },
    });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", contentType);
  responseHeaders.set("Cache-Control", responseCacheControl);

  const cacheControl = backendResponse.headers.get("cache-control");
  if (cacheControl && cacheSeconds <= 0) {
    responseHeaders.set("Cache-Control", cacheControl);
  }

  const contentDisposition = backendResponse.headers.get("content-disposition");
  if (contentDisposition) {
    responseHeaders.set("Content-Disposition", contentDisposition);
  }

  const payload = await backendResponse.arrayBuffer();

  return new NextResponse(payload, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request, context) {
  return proxyToBackend(request, context);
}

export async function HEAD(request, context) {
  return proxyToBackend(request, context);
}

export async function POST(request, context) {
  return proxyToBackend(request, context);
}
