import NewsDashboard from "@/components/news-dashboard";
import { getPublicApiBaseUrl } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const API_BASE_URL = getPublicApiBaseUrl();

async function getNewsFeed() {
  try {
    const response = await fetch(`${API_BASE_URL}/news/grouped?limit=500`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      status: "Error",
      count: 0,
      grouped_records: [],
      message: error.message,
    };
  }
}

async function getCronStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/cron/status`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Cron API responded with ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      status: "Error",
      scheduler: null,
      message: error.message,
    };
  }
}

async function getSchedulerLogs() {
  try {
    const response = await fetch(`${API_BASE_URL}/scheduler/logs?limit=20`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Scheduler logs API responded with ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      status: "Error",
      records: [],
      message: error.message,
    };
  }
}

export default async function HomePage() {
  const [payload, cronPayload, schedulerLogPayload] = await Promise.all([
    getNewsFeed(),
    getCronStatus(),
    getSchedulerLogs(),
  ]);

  return (
    <NewsDashboard
      initialPayload={payload}
      cronPayload={cronPayload}
      initialSchedulerLogPayload={schedulerLogPayload}
      apiBaseUrl={API_BASE_URL}
    />
  );
}
