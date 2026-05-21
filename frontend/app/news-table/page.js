import NewsTableDesk from "@/components/news-table-desk";
import NewsTableLogin from "@/components/news-table-login";
import { hasNewsTableSession } from "@/lib/news-table-auth";

export const dynamic = "force-dynamic";

function createInitialPayload() {
  return {
    status: "Loading",
    count: 0,
    category_count: 0,
    grouped_records: [],
    loaded_at: new Date().toISOString(),
  };
}

export default async function NewsTablePage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const authenticated = await hasNewsTableSession();
  const loginError = resolvedSearchParams?.error === "invalid-login"
    ? "Client ID or password is incorrect."
    : "";

  if (!authenticated) {
    return <NewsTableLogin error={loginError} />;
  }

  return <NewsTableDesk initialPayload={createInitialPayload()} />;
}
