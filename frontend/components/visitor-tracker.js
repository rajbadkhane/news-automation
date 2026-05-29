"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VISITOR_KEY = "genh_visitor_id";
const SESSION_KEY = "genh_session_id";

function createId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getStoredId(key, prefix, storage) {
  const existing = storage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = createId(prefix);
  storage.setItem(key, next);
  return next;
}

function getUtmValue(searchParams, name) {
  return searchParams.get(name) || "";
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api") || pathname.startsWith("/admin")) {
      return;
    }

    let cancelled = false;

    try {
      const visitorId = getStoredId(VISITOR_KEY, "visitor", window.localStorage);
      const sessionId = getStoredId(SESSION_KEY, "session", window.sessionStorage);
      const query = searchParams.toString();
      const path = query ? `${pathname}?${query}` : pathname;

      const payload = {
        visitor_id: visitorId,
        session_id: sessionId,
        path,
        title: document.title,
        referrer: document.referrer,
        utm_source: getUtmValue(searchParams, "utm_source"),
        utm_medium: getUtmValue(searchParams, "utm_medium"),
        utm_campaign: getUtmValue(searchParams, "utm_campaign"),
      };

      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/visit", blob);
        return;
      }

      fetch("/api/analytics/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        if (!cancelled) {
          // Analytics should never interrupt the newsroom UI.
        }
      });
    } catch {
      // Ignore browsers with storage disabled.
    }

    return () => {
      cancelled = true;
    };
  }, [pathname, searchParams]);

  return null;
}
