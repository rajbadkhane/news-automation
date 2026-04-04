import { ADMIN_API_BASE_URL, ADMIN_MASTER_API_KEY } from "@/lib/admin-config";

async function parseBackendResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return {
    success: response.ok,
    raw: await response.text(),
  };
}

export async function backendRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ADMIN_MASTER_API_KEY,
    },
    cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await parseBackendResponse(response);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Backend request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function getAdminBootstrap() {
  const [
    clients,
    rewrites,
    cronStatus,
    aiCronStatus,
    schedulerLogs,
    deliveryGrouped,
  ] = await Promise.all([
    backendRequest("/api/v1/admin/clients"),
    backendRequest("/api/v1/admin/ai/rewrites?limit=100"),
    backendRequest("/api/v1/cron/status"),
    backendRequest("/api/v1/ai/cron/status"),
    backendRequest("/api/v1/scheduler/logs?limit=20"),
    backendRequest("/api/v1/delivery/news/grouped?language=both&limit=100"),
  ]);

  return {
    success: true,
    data: {
      clients: clients.data || [],
      rewrites: rewrites.data || [],
      cronStatus: cronStatus.data || null,
      aiCronStatus: aiCronStatus.data || null,
      schedulerLogs: schedulerLogs.data || [],
      deliveryGrouped: deliveryGrouped.data || [],
    },
  };
}
