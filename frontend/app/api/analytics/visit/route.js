import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/runtime-env";

const API_BASE_URL = getServerApiBaseUrl();

function getForwardedHeader(request, name) {
  return request.headers.get(name) || "";
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const response = await fetch(`${API_BASE_URL}/api/v1/analytics/visit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": getForwardedHeader(request, "user-agent"),
        "X-Forwarded-For": getForwardedHeader(request, "x-forwarded-for"),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[analytics-proxy] Backend request failed:", {
      baseUrl: API_BASE_URL,
      message: error?.message || String(error),
      cause: error?.cause?.code || error?.cause?.message || null,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VISIT_PROXY_FAILED",
          message: "Analytics backend is temporarily unavailable.",
        },
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
