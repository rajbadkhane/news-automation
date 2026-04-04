import { NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/admin-auth";
import { backendRequest } from "@/lib/admin-api";

export async function POST(request, { params }) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { rewriteId } = params;
    const payload = await backendRequest(`/api/v1/admin/ai/rewrites/${rewriteId}/unpublish`, {
      method: "POST",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "REWRITE_UNPUBLISH_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}
