"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const CLIENT_API_BASE_URL = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");

function formatTimestamp(value) {
  if (!value) {
    return "Not available";
  }

  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function prettifyCategory(value) {
  return (value || "uncategorized")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toneForStatus(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("success") || normalized.includes("active") || normalized.includes("published")) {
    return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  }
  if (normalized.includes("draft") || normalized.includes("skip") || normalized.includes("pending")) {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }
  if (normalized.includes("error") || normalized.includes("inactive") || normalized.includes("failed")) {
    return "border-rose-300/30 bg-rose-400/10 text-rose-100";
  }

  return "border-white/10 bg-white/10 text-slate-100";
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildClientDeliveryExample(apiKey) {
  return `curl "${CLIENT_API_BASE_URL}/api/v1/delivery/news?limit=10" \\
  -H "x-api-key: ${apiKey}"`;
}

function buildClientStats(data) {
  const clients = data?.clients || [];
  const rewrites = data?.rewrites || [];
  const deliveryGroups = data?.deliveryGrouped || [];
  const cronStatus = data?.cronStatus || {};
  const aiCronStatus = data?.aiCronStatus || {};

  return [
    {
      label: "Clients",
      value: clients.length,
      note: `${clients.filter((item) => item.is_active).length} active`,
    },
    {
      label: "Published Stories",
      value: rewrites.filter((item) => item.publication?.status === "published").length,
      note: `${rewrites.filter((item) => item.publication?.status !== "published").length} drafts`,
    },
    {
      label: "Delivery Categories",
      value: deliveryGroups.length,
      note: "ready for client websites",
    },
    {
      label: "Pipeline Health",
      value: cronStatus?.enabled && aiCronStatus?.enabled ? "ON" : "OFF",
      note: `Main ${formatTimestamp(cronStatus?.last_run_at)} | AI ${formatTimestamp(aiCronStatus?.last_run_at)}`,
    },
  ];
}

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload?.error?.message || payload?.message || "Request failed.");
  }

  return payload;
}

function SectionCard({ id, eyebrow, title, subtitle, actions, children }) {
  return (
    <section
      id={id}
      className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(8,15,30,0.88))] p-6 shadow-[0_24px_80px_rgba(2,6,23,0.42)]"
    >
      <div className="flex flex-col gap-4 border-b border-white/8 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{eyebrow}</p>
          <h2 className="mt-3 font-[var(--font-display)] text-4xl leading-none text-white">{title}</h2>
          {subtitle ? <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StatTile({ label, value, note }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/5 p-5">
      <p className="text-[11px] uppercase tracking-[0.26em] text-slate-400">{label}</p>
      <p className="mt-3 font-[var(--font-display)] text-4xl leading-none text-white">{String(value)}</p>
      <p className="mt-3 text-sm leading-6 text-slate-400">{note}</p>
    </div>
  );
}

function SidebarLink({ href, label, detail }) {
  return (
    <a
      href={href}
      className="block rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 transition hover:border-cyan-300/20 hover:bg-cyan-400/10"
    >
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p>
    </a>
  );
}

export default function AdminControlCenter({
  authenticated,
  initialData,
  initialError = "",
  loginError = "",
}) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(authenticated);
  const [panelData, setPanelData] = useState(initialData);
  const [errorMessage, setErrorMessage] = useState(initialError || loginError);
  const [actionMessage, setActionMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [rewriteFilter, setRewriteFilter] = useState("all");
  const [clientForm, setClientForm] = useState({
    name: "",
    allowed_origins: "",
    allowed_scopes: "delivery:read",
    quota_limit: "5000",
    quota_window: "day",
    notes: "",
  });
  const [lastIssuedKey, setLastIssuedKey] = useState("");
  const [lastIssuedClientName, setLastIssuedClientName] = useState("");
  const [lastIssuedScopes, setLastIssuedScopes] = useState([]);

  const stats = useMemo(() => buildClientStats(panelData), [panelData]);
  const clients = panelData?.clients || [];
  const rewrites = panelData?.rewrites || [];
  const filteredRewrites = rewrites.filter((item) => (
    rewriteFilter === "all" ? true : item.publication?.status === rewriteFilter
  ));
  const deliveryGroups = panelData?.deliveryGrouped || [];
  const schedulerLogs = panelData?.schedulerLogs || [];
  const cronStatus = panelData?.cronStatus || null;
  const aiCronStatus = panelData?.aiCronStatus || null;

  async function refreshPanel() {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/bootstrap", { cache: "no-store" });
      const payload = await readJson(response);
      setPanelData(payload.data);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/admin/logout", { method: "POST" });
    setIsAuthenticated(false);
    setPanelData(null);
    setActionMessage("");
    setLastIssuedKey("");
    setLastIssuedClientName("");
    setLastIssuedScopes([]);
    router.replace(`/admin?ts=${Date.now()}`);
    router.refresh();
  }

  async function copyText(value, successMessage) {
    try {
      await navigator.clipboard.writeText(value);
      setActionMessage(successMessage);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error.message || "Clipboard copy failed.");
    }
  }

  async function handleClientCreate(event) {
    event.preventDefault();

    try {
      setLoading(true);
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientForm.name,
          allowed_origins: parseCommaList(clientForm.allowed_origins),
          allowed_scopes: parseCommaList(clientForm.allowed_scopes),
          quota_limit: Number.parseInt(clientForm.quota_limit, 10) || null,
          quota_window: clientForm.quota_window || null,
          notes: clientForm.notes,
        }),
      });
      const payload = await readJson(response);
      setLastIssuedKey(payload?.data?.api_key || "");
      setLastIssuedClientName(payload?.data?.client?.name || clientForm.name || "");
      setLastIssuedScopes(payload?.data?.client?.allowed_scopes || parseCommaList(clientForm.allowed_scopes));
      setActionMessage(`Client ${payload?.data?.client?.name || "created"} is ready for onboarding.`);
      setClientForm({
        name: "",
        allowed_origins: "",
        allowed_scopes: "delivery:read",
        quota_limit: "5000",
        quota_window: "day",
        notes: "",
      });
      await refreshPanel();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleClientStatus(client) {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_active: !client.is_active,
          notes: client.is_active ? "Disabled from admin panel" : "Re-enabled from admin panel",
        }),
      });
      await readJson(response);
      setActionMessage(`${client.name} is now ${client.is_active ? "inactive" : "active"}.`);
      await refreshPanel();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function rotateClientKey(client) {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/clients/${client.id}/rotate-key`, {
        method: "POST",
      });
      const payload = await readJson(response);
      setLastIssuedKey(payload?.data?.api_key || "");
      setLastIssuedClientName(client.name || "");
      setLastIssuedScopes(client.allowed_scopes || []);
      setActionMessage(`Fresh API key generated for ${client.name || "client"}. Share it securely.`);
      await refreshPanel();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateRewriteStatus(rewriteId, nextStatus) {
    try {
      setLoading(true);
      const endpoint = nextStatus === "published" ? "publish" : "unpublish";
      const response = await fetch(`/api/admin/rewrites/${rewriteId}/${endpoint}`, {
        method: "POST",
      });
      await readJson(response);
      setActionMessage(nextStatus === "published" ? "Story published for clients." : "Story moved back to draft.");
      await refreshPanel();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function runCron(scheduler) {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduler,
          limit: 1,
          wait: scheduler === "ai",
        }),
      });
      await readJson(response);
      setActionMessage(`${scheduler === "ai" ? "AI" : "Main"} cron run started.`);
      await refreshPanel();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      startTransition(() => {
        void refreshPanel();
      });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(87,217,255,0.12),transparent_28%),radial-gradient(circle_at_75%_0%,rgba(255,184,77,0.12),transparent_25%),linear-gradient(180deg,#08111d_0%,#0d1526_50%,#08101c_100%)] px-6 py-12">
        <div className="mx-auto max-w-5xl rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(9,16,31,0.94),rgba(21,31,52,0.9))] p-6 shadow-[0_30px_100px_rgba(2,6,23,0.55)] md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[28px] border border-white/8 bg-white/[0.04] p-6">
              <p className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-1 text-[11px] uppercase tracking-[0.3em] text-cyan-100">
                Admin Access
              </p>
              <h1 className="mt-6 font-[var(--font-display)] text-5xl leading-none text-white">
                Newsroom Command Center
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Sign in to control client delivery, publish AI stories, run cron jobs, and manage the business side of your news system from one place.
              </p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 md:p-8">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Sign In</p>
              <h2 className="mt-3 font-[var(--font-display)] text-4xl text-white">Open The Admin Panel</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Use your admin password to access the delivery controls and internal publishing workflow.
              </p>
              <form action="/admin/login" method="POST" className="mt-8 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-slate-400">Admin Password</span>
                  <input
                    type="password"
                    name="password"
                    className="w-full rounded-2xl border border-white/10 bg-[#16213a] px-4 py-4 text-sm text-white outline-none transition focus:border-amber-300/50"
                    placeholder="Enter admin password"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-[linear-gradient(90deg,#ffd34d,#f7c948)] px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950 transition hover:brightness-105"
                >
                  Enter Admin Panel
                </button>
              </form>
              {errorMessage ? (
                <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(87,217,255,0.1),transparent_22%),radial-gradient(circle_at_100%_0%,rgba(255,184,77,0.14),transparent_26%),linear-gradient(180deg,#07101d_0%,#0b1323_45%,#07101c_100%)] text-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-4 xl:flex-row xl:px-6">
        <aside className="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)] xl:w-[300px] xl:flex-shrink-0">
          <div className="h-full rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,15,28,0.97),rgba(12,20,36,0.96))] p-5 shadow-[0_26px_90px_rgba(2,6,23,0.45)]">
            <div className="rounded-[26px] border border-cyan-300/15 bg-cyan-400/8 p-5">
              <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100">Gautam Tech Studio</p>
              <h1 className="mt-4 font-[var(--font-display)] text-4xl leading-none text-white">
                Admin Control
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Manage delivery, publishing, clients, and cron operations from one dashboard.
              </p>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-[11px] uppercase tracking-[0.28em] text-slate-500">Navigation</p>
              <div className="space-y-3">
                <SidebarLink href="#overview" label="Overview" detail="Key metrics and health at a glance." />
                <SidebarLink href="#operations" label="Operations" detail="Run cron jobs and monitor pipeline status." />
                <SidebarLink href="#clients" label="Clients" detail="Create keys, control scopes, and pause access." />
                <SidebarLink href="#publishing" label="Publishing" detail="Approve or unpublish rewritten articles." />
                <SidebarLink href="#delivery" label="Delivery Preview" detail="See what client websites receive." />
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Session</p>
              <p className="mt-2 text-sm text-slate-200">Authenticated admin session is active.</p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => void refreshPanel()}
                  className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-100"
                >
                  {loading ? "Refreshing..." : "Refresh Panel"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="w-full rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-xs uppercase tracking-[0.18em] text-rose-100"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          <header className="rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(17,26,46,0.96),rgba(9,16,28,0.94))] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.4)]">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <p className="text-[11px] uppercase tracking-[0.3em] text-amber-200">Professional News Operations</p>
                <h2 className="mt-4 font-[var(--font-display)] text-5xl leading-none text-white md:text-6xl">
                  Run the full client delivery business
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  This panel controls your private RSS-to-AI workflow and the final published output delivered to paying client websites in real time.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void runCron("main")}
                  className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-5 py-3 text-xs uppercase tracking-[0.2em] text-cyan-100"
                >
                  Run Main Cron
                </button>
                  <button
                    type="button"
                    onClick={() => void runCron("ai")}
                  className="rounded-full border border-amber-300/20 bg-amber-400/10 px-5 py-3 text-xs uppercase tracking-[0.2em] text-amber-100"
                >
                  Run AI Cron
                </button>
              </div>
            </div>

            {actionMessage ? (
              <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {actionMessage}
              </div>
            ) : null}
            {errorMessage ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}
            {lastIssuedKey ? (
              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-slate-950/65 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-200/80">Latest Issued API Key</p>
                {lastIssuedClientName ? (
                  <p className="mt-2 text-sm text-slate-200">Client: {lastIssuedClientName}</p>
                ) : null}
                <p className="mt-2 break-all font-mono text-xs text-amber-100">{lastIssuedKey}</p>
                <p className="mt-3 text-xs leading-6 text-slate-400">
                  Base URL: {CLIENT_API_BASE_URL}
                  {lastIssuedScopes.length ? ` | Scopes: ${lastIssuedScopes.join(", ")}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyText(lastIssuedKey, "API key copied.")}
                    className="rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-amber-100"
                  >
                    Copy API Key
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyText(buildClientDeliveryExample(lastIssuedKey), "Client API example copied.")}
                    className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100"
                  >
                    Copy API Example
                  </button>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#08111d] p-3 text-xs leading-6 text-slate-300">
{buildClientDeliveryExample(lastIssuedKey)}
                </pre>
              </div>
            ) : null}
          </header>

          <section id="overview" className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {stats.map((item) => (
              <StatTile key={item.label} label={item.label} value={item.value} note={item.note} />
            ))}
          </section>

          <SectionCard
            id="operations"
            eyebrow="Operations"
            title="Pipeline Status"
            subtitle="Watch scheduler health, recent automation activity, and delivery-readiness without digging through raw logs."
          >
            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">Main Cron</h3>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneForStatus(cronStatus?.enabled ? "active" : "inactive")}`}>
                      {cronStatus?.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Last Run</p>
                      <p className="mt-2 text-sm text-slate-200">{formatTimestamp(cronStatus?.last_run_at)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Last Tick</p>
                      <p className="mt-2 text-sm text-slate-200">{formatTimestamp(cronStatus?.last_tick_at)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">AI Cron</h3>
                    <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneForStatus(aiCronStatus?.enabled ? "active" : "inactive")}`}>
                      {aiCronStatus?.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Last Run</p>
                      <p className="mt-2 text-sm text-slate-200">{formatTimestamp(aiCronStatus?.last_run_at)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Last Tick</p>
                      <p className="mt-2 text-sm text-slate-200">{formatTimestamp(aiCronStatus?.last_tick_at)}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">Recent Scheduler Activity</h3>
                  <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Latest 8 runs</span>
                </div>
                <div className="mt-4 space-y-3">
                  {schedulerLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {log.scheduler_name} / {log.category || log.run_type}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                            {formatTimestamp(log.started_at)}
                          </p>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.2em] ${toneForStatus(log.status)}`}>
                          {log.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-300">{log.message || "No message available."}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="clients"
            eyebrow="Clients"
            title="Client Access Management"
            subtitle="Create new customer accounts, assign delivery scopes, control quotas, and pause access when needed."
          >
            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <form onSubmit={handleClientCreate} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <h3 className="text-lg font-semibold text-white">Create New Client</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  New client create karte hi working API key generate ho jayegi jo aap client ko share kar sakte ho.
                </p>
                <div className="mt-5 grid gap-4">
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Client Name</span>
                    <input
                      value={clientForm.name}
                      onChange={(event) => setClientForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                      placeholder="Example Media House"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Allowed Origins</span>
                    <input
                      value={clientForm.allowed_origins}
                      onChange={(event) => setClientForm((current) => ({ ...current, allowed_origins: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                      placeholder="https://client.com, https://www.client.com"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Scopes</span>
                    <input
                      value={clientForm.allowed_scopes}
                      onChange={(event) => setClientForm((current) => ({ ...current, allowed_scopes: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                      placeholder="delivery:read"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Quota Limit</span>
                      <input
                        value={clientForm.quota_limit}
                        onChange={(event) => setClientForm((current) => ({ ...current, quota_limit: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                        placeholder="5000"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Quota Window</span>
                      <select
                        value={clientForm.quota_window}
                        onChange={(event) => setClientForm((current) => ({ ...current, quota_window: event.target.value }))}
                        className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                      >
                        <option value="day">day</option>
                        <option value="week">week</option>
                        <option value="month">month</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-[11px] uppercase tracking-[0.22em] text-slate-500">Internal Notes</span>
                    <textarea
                      value={clientForm.notes}
                      onChange={(event) => setClientForm((current) => ({ ...current, notes: event.target.value }))}
                      className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white"
                      placeholder="Billing, package details, delivery notes"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-2xl bg-[linear-gradient(90deg,#ffd34d,#f7c948)] px-4 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-slate-950"
                  >
                    Create Client + Generate Key
                  </button>
                </div>
              </form>
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">Existing Clients</h3>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{clients.length} total</span>
                </div>
                <div className="mt-5 space-y-3">
                  {clients.map((client) => (
                    <div key={client.id} className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold text-white">{client.name}</h4>
                            <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${toneForStatus(client.is_active ? "active" : "inactive")}`}>
                              {client.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                            Scopes: {(client.allowed_scopes || []).join(", ") || "none"}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            Origins: {(client.allowed_origins || []).join(", ") || "No origin restriction"}
                          </p>
                          <div className="mt-3 grid gap-2 text-sm text-slate-400 md:grid-cols-2">
                            <p>Quota: {client.quota_limit || "unlimited"} / {client.quota_window || "n/a"}</p>
                            <p>Last used: {formatTimestamp(client.last_used_at)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void toggleClientStatus(client)}
                            className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-slate-100"
                          >
                            {client.is_active ? "Disable" : "Enable"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void rotateClientKey(client)}
                            className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-cyan-100"
                          >
                            Generate New API Key
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            id="publishing"
            eyebrow="Publishing"
            title="AI Rewrite Approval Queue"
            subtitle="Review rewritten stories, filter by publication state, and decide exactly what paying clients can access."
            actions={(
              <select
                value={rewriteFilter}
                onChange={(event) => setRewriteFilter(event.target.value)}
                className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-xs uppercase tracking-[0.18em] text-white"
              >
                <option value="all">All Stories</option>
                <option value="draft">Draft Only</option>
                <option value="published">Published Only</option>
              </select>
            )}
          >
            <div className="space-y-3">
              {filteredRewrites.slice(0, 24).map((rewrite) => (
                <div key={rewrite.id} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${toneForStatus(rewrite.publication?.status)}`}>
                          {rewrite.publication?.status || "draft"}
                        </span>
                        <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {rewrite.news?.category_display_name || prettifyCategory(rewrite.news?.category)}
                        </span>
                      </div>
                      <h3 className="mt-4 text-xl font-semibold leading-8 text-white">
                        {rewrite.english?.headline || rewrite.source_title || "Untitled rewrite"}
                      </h3>
                      <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
                        {rewrite.english?.short_description || rewrite.hindi?.short_description || "No summary available."}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                        <span>Updated {formatTimestamp(rewrite.updated_at)}</span>
                        <span>Slug {rewrite.publication?.slug || "not generated yet"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {rewrite.publication?.status === "published" ? (
                        <button
                          type="button"
                          onClick={() => void updateRewriteStatus(rewrite.id, "draft")}
                          className="rounded-full border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-amber-100"
                        >
                          Unpublish
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateRewriteStatus(rewrite.id, "published")}
                          className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-emerald-100"
                        >
                          Publish
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            id="delivery"
            eyebrow="Delivery"
            title="What Client Websites See"
            subtitle="Preview the category-based feed your clients receive after your internal RSS, rewrite, and publish pipeline finishes."
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {deliveryGroups.map((group) => (
                <div key={group.category} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{group.category}</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">
                        {group.category_display_name || prettifyCategory(group.category)}
                      </h3>
                    </div>
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-100">
                      {group.published_count} Published
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Main Cron</p>
                      <p className="mt-2">{group.main_cron?.last_status || "Waiting"}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatTimestamp(group.main_cron?.last_run_at)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">AI Cron</p>
                      <p className="mt-2">{group.ai_cron?.last_status || "Waiting"}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatTimestamp(group.ai_cron?.last_run_at)}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {(group.records || []).slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                        <p className="text-sm font-semibold leading-6 text-white">
                          {item.article?.english?.headline || item.article?.headline || "Article"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{item.media?.image_link ? "Image ready" : "No image"}</span>
                          <span>Published {formatTimestamp(item.published_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
