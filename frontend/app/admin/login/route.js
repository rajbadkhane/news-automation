import { NextResponse } from "next/server";
import { isValidAdminPassword, setAdminSession } from "@/lib/admin-auth";

export async function POST(request) {
  const formData = await request.formData();
  const password = String(formData.get("password") || "");

  if (!isValidAdminPassword(password)) {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/admin?error=invalid-password",
      },
    });
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/admin?ts=${Date.now()}`,
    },
  });
  return setAdminSession(response);
}
