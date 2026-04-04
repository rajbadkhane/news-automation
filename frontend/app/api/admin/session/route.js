import { NextResponse } from "next/server";
import {
  clearAdminSession,
  isValidAdminPassword,
  setAdminSession,
} from "@/lib/admin-auth";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const password = String(body?.password || "");

  if (!isValidAdminPassword(password)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INVALID_PASSWORD",
          message: "Admin password is invalid.",
        },
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    success: true,
    data: {
      authenticated: true,
    },
  });

  return setAdminSession(response);
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    data: {
      authenticated: false,
    },
  });

  return clearAdminSession(response);
}
