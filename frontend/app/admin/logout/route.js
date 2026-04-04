import { NextResponse } from "next/server";
import { clearAdminSession } from "@/lib/admin-auth";

export async function POST(request) {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/admin?ts=${Date.now()}`,
    },
  });
  return clearAdminSession(response);
}
