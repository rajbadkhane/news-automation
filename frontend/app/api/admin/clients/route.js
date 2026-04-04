import { NextResponse } from "next/server";
import { ensureAdminRequest } from "@/lib/admin-auth";
import { backendRequest } from "@/lib/admin-api";

export async function GET(request) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = await backendRequest("/api/v1/admin/clients");
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CLIENTS_FETCH_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}

export async function POST(request) {
  const unauthorized = ensureAdminRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const payload = await backendRequest("/api/v1/admin/clients", {
      method: "POST",
      body,
    });
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CLIENT_CREATE_FAILED",
          message: error.message,
        },
      },
      { status: error.status || 500 }
    );
  }
}
