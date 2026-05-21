import { NextResponse } from "next/server";
import { setNewsTableSession, validateNewsTableLogin } from "@/lib/news-table-auth";

export async function POST(request) {
  const formData = await request.formData();
  const clientId = String(formData.get("clientId") || "");
  const password = String(formData.get("password") || "");
  const client = validateNewsTableLogin(clientId, password);

  if (!client) {
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/news-table?error=invalid-login",
      },
    });
  }

  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/news-table?ts=${Date.now()}`,
    },
  });
  return setNewsTableSession(response, client.id);
}
