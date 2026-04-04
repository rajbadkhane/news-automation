import { NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/admin-auth";
import { backendRequest } from "@/lib/admin-api";

export async function PATCH(request, { params }) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const { clientId } = params;
    const body = await request.json().catch(() => ({}));
    const payload = await backendRequest(`/api/v1/admin/clients/${clientId}`, {
      method: "PATCH",
      body,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CLIENT_UPDATE_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}
