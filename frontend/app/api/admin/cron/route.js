import { NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/admin-auth";
import { backendRequest } from "@/lib/admin-api";

export async function POST(request) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const scheduler = String(body?.scheduler || "main").trim().toLowerCase();
    const wait = body?.wait ? "true" : "false";
    const limit = body?.limit ? String(body.limit) : "1";

    const path = scheduler === "ai"
      ? `/api/v1/ai/cron/run-now?wait=${wait}&limit=${limit}`
      : `/api/v1/cron/run-now?wait=${wait}&limit=${limit}`;

    const payload = await backendRequest(path, {
      method: "POST",
      body: {},
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CRON_TRIGGER_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}
