import { NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/admin-auth";
import { backendRequest } from "@/lib/admin-api";

export async function GET(request) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const limit = searchParams.get("limit") || "100";
    const query = new URLSearchParams();
    query.set("limit", limit);
    if (status) {
      query.set("status", status);
    }
    if (category) {
      query.set("category", category);
    }

    const payload = await backendRequest(`/api/v1/admin/ai/rewrites?${query.toString()}`);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "REWRITES_FETCH_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}
