import { NextResponse } from "next/server";
import { clearNewsTableSession } from "@/lib/news-table-auth";

export async function POST() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/news-table?ts=${Date.now()}`,
    },
  });
  return clearNewsTableSession(response);
}
