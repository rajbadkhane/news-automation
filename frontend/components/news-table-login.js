"use client";

import { useEffect, useState } from "react";

const FEATURES = [
  ["fast", "Rapid"],
  ["accurate", "Verified"],
  ["impartial", "Neutral"],
  ["global", "National"],
];

const STATUS_ITEMS = [
  ["Wire", "Online"],
  ["Desk", "Secured"],
  ["Access", "Client only"],
];

function SmallIcon({ type }) {
  const base = "h-8 w-8 text-[#ed102a]";
  if (type === "fast") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className={base}>
        <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="7 5" />
        <path d="M24 13v12l8 5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      </svg>
    );
  }
  if (type === "accurate") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className={base}>
        <path d="M24 6 39 12v11c0 10-6 16-15 20C15 39 9 33 9 23V12l15-6Z" fill="none" stroke="currentColor" strokeWidth="2.6" />
        <path d="m16 24 6 6 12-14" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />
      </svg>
    );
  }
  if (type === "impartial") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className={base}>
        <path d="M24 7v33M13 13h22M11 13 6 27h10l-5-14Zm26 0-5 14h10l-5-14Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
        <path d="M16 40h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={base}>
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <path d="M7 24h34M24 7c6 5 9 11 9 17s-3 12-9 17c-6-5-9-11-9-17s3-12 9-17Z" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  );
}

function FieldIcon({ type }) {
  if (type === "password") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-[#6b7688]">
        <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <rect width="14" height="10" x="5" y="10" rx="2" fill="currentColor" opacity=".9" />
        <circle cx="12" cy="15" r="1.45" fill="white" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-[#6b7688]">
      <circle cx="12" cy="8" r="4" fill="currentColor" />
      <path d="M4 21a8 8 0 0 1 16 0" fill="currentColor" />
    </svg>
  );
}

function EyeIcon({ hidden }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-[#65748b]">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="2" />
      {hidden ? <path d="M4 20 20 4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /> : null}
    </svg>
  );
}

export default function NewsTableLogin({ error = "" }) {
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("gts-news-table-cache-v2"))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch {
      // Login still works if browser storage is disabled.
    }
  }, []);

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#020916] text-white">
      <style jsx global>{`
        .news-login-input,
        .news-login-input:-webkit-autofill,
        .news-login-input:-webkit-autofill:hover,
        .news-login-input:-webkit-autofill:focus,
        .news-login-input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
          box-shadow: 0 0 0 1000px #ffffff inset !important;
          -webkit-text-fill-color: #17233c !important;
          caret-color: #17233c;
          background-color: #ffffff !important;
        }

        @media (prefers-reduced-motion: no-preference) {
          .news-login-globe {
            animation: news-login-drift 18s ease-in-out infinite alternate;
          }

          .news-login-scan {
            animation: news-login-scan 7s linear infinite;
          }
        }

        @keyframes news-login-drift {
          from {
            transform: translate3d(0, 0, 0) scale(1);
          }
          to {
            transform: translate3d(-18px, 10px, 0) scale(1.025);
          }
        }

        @keyframes news-login-scan {
          from {
            transform: translateY(-100%);
          }
          to {
            transform: translateY(420%);
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(2,9,22,0.99),rgba(5,16,33,0.97)_46%,rgba(8,11,20,0.99)),radial-gradient(circle_at_78%_26%,rgba(0,105,190,0.22),transparent_32%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:48px_48px]" />
      <div className="news-login-globe pointer-events-none absolute right-[-220px] top-[3vh] h-[720px] w-[720px] rounded-full border border-[#d90b24]/50 opacity-75 md:right-[-150px] lg:right-[-90px]">
        <div className="absolute inset-[42px] rounded-full border border-[#d90b24]/25" />
        <div className="absolute inset-[74px] rounded-full bg-[radial-gradient(circle,rgba(0,116,214,0.9)_1.2px,transparent_1.6px)] bg-[length:14px_14px] opacity-45 [mask-image:radial-gradient(circle,black_0_58%,transparent_70%)]" />
        <div className="news-login-scan absolute left-[22%] right-[22%] top-[22%] h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-gradient-to-b from-transparent via-white/12 to-transparent lg:block" />

      <section className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1240px] grid-cols-1 items-center gap-8 px-4 pb-32 pt-8 sm:px-8 sm:pb-[136px] sm:pt-10 lg:grid-cols-12 lg:gap-6 lg:px-4 lg:pb-24 lg:pt-8 xl:px-12">
        <div className="lg:col-span-7">
          <div className="mx-auto w-full max-w-[610px] lg:mx-0">
            <div className="grid grid-cols-[74px_1px_minmax(0,1fr)] items-start gap-4 sm:grid-cols-[86px_1px_minmax(0,1fr)] sm:gap-5">
              <img
                src="/images/logo.png"
                alt="Gautam Enterprises GEN-H logo"
                className="h-[70px] w-[74px] object-contain sm:h-[82px] sm:w-[86px]"
              />
              <div className="h-[78px] w-px bg-white/55 sm:h-[90px]" />
              <div className="min-w-0">
                <p className="font-serif text-[40px] font-bold leading-[0.9] tracking-[0.02em] text-white drop-shadow-[0_4px_18px_rgba(255,255,255,0.16)] sm:text-[50px] lg:text-[54px]">
                  GAUTAM
                </p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.38em] text-white/95 sm:text-base">
                  Enterprises
                </p>
                <div className="mt-3 grid max-w-[310px] grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <span className="h-px bg-[#ed102a]" />
                  <span className="text-[30px] font-black leading-none tracking-[0.2em] text-[#ed102a] sm:text-[34px]">
                    GEN-H
                  </span>
                  <span className="h-px bg-[#ed102a]" />
                </div>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.34em] text-white/75 sm:text-xs">
                  A wired news agency
                </p>
              </div>
            </div>

            <div className="mt-12 max-w-[570px] sm:mt-14 lg:mt-12">
              <p className="mb-4 inline-flex rounded-md border border-white/12 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/68">
                Secured distribution desk
              </p>
              <h1 className="max-w-[560px] text-[36px] font-semibold leading-[1.08] tracking-normal text-white sm:text-[44px] lg:text-[48px]">
                Real-time verified news for every newsroom.
              </h1>
              <div className="mt-6 h-1 w-16 bg-[#ed102a]" />
              <p className="mt-6 max-w-[540px] text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
                Gautam Enterprises GEN-H delivers fast, accurate and unbiased news content to newsrooms, media platforms and organizations worldwide.
              </p>
            </div>

            <div className="mt-10 grid max-w-[560px] grid-cols-2 overflow-hidden rounded-lg border border-white/12 bg-white/[0.035] sm:grid-cols-4">
              {FEATURES.map(([type, label], index) => (
                <div
                  key={type}
                  className={`flex min-h-[98px] flex-col items-center justify-center gap-3 px-3 text-center ${index ? "border-l border-white/10" : ""} ${index > 1 ? "border-t border-white/10 sm:border-t-0" : ""}`}
                >
                  <SmallIcon type={type} />
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/86">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-3">
              {STATUS_ITEMS.map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/48">{label}</p>
                  <p className="mt-1 text-sm font-bold text-white/90">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-center lg:col-span-5 lg:justify-end">
          <section className="w-full max-w-[430px] rounded-lg border border-white/35 bg-white/[0.97] p-6 text-[#0c1020] shadow-[0_22px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-7">
            <div className="border-b border-[#d7dee8] pb-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c70018]">Client Login</p>
                <span className="inline-flex items-center gap-2 rounded-md border border-[#d7dee8] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#45546a]">
                  <span className="h-2 w-2 rounded-full bg-[#18a058] shadow-[0_0_12px_rgba(24,160,88,0.5)]" />
                  Live
                </span>
              </div>
              <h2 className="mt-3 text-[28px] font-black leading-[1.08] tracking-normal text-[#080d19] sm:text-[32px]">
                Wired News Distribution
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#5b6a82]">
                Secure access for authorized clients of Gautam Enterprises GEN-H.
              </p>
            </div>

            <form action="/news-table/login" method="POST" className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-[#111827]">
                  Client ID
                </span>
                <span className="flex h-12 items-center rounded-md border border-[#c8d1de] bg-white px-3 shadow-[inset_0_1px_2px_rgba(12,16,32,0.04)] transition focus-within:border-[#b60016] focus-within:ring-2 focus-within:ring-[#d00019]/10">
                  <FieldIcon />
                  <input
                    name="clientId"
                    type="text"
                    autoComplete="username"
                    className="news-login-input ml-3 h-full min-w-0 flex-1 bg-white text-sm font-semibold text-[#17233c] outline-none placeholder:text-[#79869a]"
                    placeholder="Enter client ID"
                    required
                  />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-[#111827]">
                  Password
                </span>
                <span className="flex h-12 items-center rounded-md border border-[#c8d1de] bg-white px-3 shadow-[inset_0_1px_2px_rgba(12,16,32,0.04)] transition focus-within:border-[#b60016] focus-within:ring-2 focus-within:ring-[#d00019]/10">
                  <FieldIcon type="password" />
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="news-login-input ml-3 h-full min-w-0 flex-1 bg-white text-sm font-semibold text-[#17233c] outline-none placeholder:text-[#79869a]"
                    placeholder="Enter password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition hover:bg-[#edf1f6] focus:outline-none focus:ring-2 focus:ring-[#d00019]/25"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <EyeIcon hidden={!showPassword} />
                  </button>
                </span>
              </label>

              <button
                type="submit"
                className="h-12 w-full rounded-md bg-gradient-to-r from-[#ac0015] to-[#d00019] px-4 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_12px_26px_rgba(203,0,24,0.26)] transition duration-200 hover:-translate-y-0.5 hover:from-[#960013] hover:to-[#bd0016] hover:shadow-[0_16px_34px_rgba(203,0,24,0.34)] focus:outline-none focus:ring-2 focus:ring-[#d00019]/35 focus:ring-offset-2"
              >
                Access News Feed
              </button>
            </form>

            {error ? (
              <p className="mt-4 rounded-md border border-[#f0b8b8] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-[#9f1826]">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex items-start gap-3 rounded-lg border border-[#e1e7ef] bg-[#f8fafc] px-4 py-3 text-xs leading-5 text-[#66758e]">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
                <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              <p>This is a secured service for authorized GEN-H clients only.</p>
            </div>
          </section>
        </div>
      </section>

      <aside className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#020916]/95 shadow-[0_-18px_42px_rgba(0,0,0,0.3)] backdrop-blur-md">
        <div className="mx-auto grid min-h-[50px] w-full max-w-[1440px] grid-cols-1 sm:grid-cols-[150px_1fr]">
          <div className="flex items-center justify-center bg-gradient-to-r from-[#ad0015] to-[#d10820] px-5 py-3 text-center text-sm font-black uppercase leading-tight tracking-[0.08em]">
            Live<br />Updates
            <span className="ml-3 h-2.5 w-2.5 rounded-full bg-[#ff4052] shadow-[0_0_16px_rgba(255,64,82,0.9)]" />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-xs sm:text-sm">
            <span className="hidden h-7 w-px bg-white/22 md:block" />
            <span className="text-white/84">From local ground reports to global headlines</span>
            <span className="hidden h-7 w-px bg-white/22 lg:block" />
            <span className="text-white/84">Real time journalism reliable reporting</span>
            <span className="hidden h-7 w-px bg-white/22 xl:block" />
            <span className="text-white/84">Fast-Verified-First</span>
            <span className="hidden h-7 w-px bg-white/22 xl:block" />
            <span className="text-white/84">India's emerging news wire</span>
          </div>
        </div>
      </aside>
    </main>
  );
}
