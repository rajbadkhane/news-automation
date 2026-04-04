import { NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/admin-auth";
import { getAdminBootstrap } from "@/lib/admin-api";

export async function GET(request) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = await getAdminBootstrap();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "ADMIN_BOOTSTRAP_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}
