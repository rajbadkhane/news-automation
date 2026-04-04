import AdminControlCenter from "@/components/admin-control-center";
import { hasAdminSession } from "@/lib/admin-auth";
import { getAdminBootstrap } from "@/lib/admin-api";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const authenticated = await hasAdminSession();
  let initialData = null;
  let initialError = "";
  const loginError = resolvedSearchParams?.error === "invalid-password"
    ? "Admin password is invalid."
    : "";

  if (authenticated) {
    try {
      const payload = await getAdminBootstrap();
      initialData = payload.data;
    } catch (error) {
      initialError = error.message;
    }
  }

  return (
    <AdminControlCenter
      authenticated={authenticated}
      initialData={initialData}
      initialError={initialError}
      loginError={loginError}
    />
  );
}
