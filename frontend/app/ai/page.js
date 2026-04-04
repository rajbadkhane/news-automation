import AiNewsDesk from "@/components/ai-news-desk";
import { getPublicApiBaseUrl } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

const API_BASE_URL = getPublicApiBaseUrl();

async function getAiNewsFeed() {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/news/grouped?limit=100`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`AI backend responded with ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    return {
      status: "Error",
      grouped_records: [],
      message: error.message,
    };
  }
}

async function getAiCronStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/ai/cron/status`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`AI cron API responded with ${response.status}`);
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

export default async function AiPage() {
  const [aiPayload, aiCronPayload] = await Promise.all([getAiNewsFeed(), getAiCronStatus()]);

  return (
    <AiNewsDesk
      aiPayload={aiPayload}
      aiCronPayload={aiCronPayload}
      apiBaseUrl={API_BASE_URL}
    />
  );
}
