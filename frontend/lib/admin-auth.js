import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  ADMIN_PANEL_PASSWORD,
  ADMIN_PANEL_SESSION_SECRET,
  ADMIN_SESSION_COOKIE,
} from "@/lib/admin-config";

function createSessionToken() {
  return crypto
    .createHmac("sha256", ADMIN_PANEL_SESSION_SECRET)
    .update(`gts-admin:${ADMIN_PANEL_PASSWORD}`)
    .digest("hex");
}

function timingSafeMatch(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function isValidAdminPassword(password) {
  return timingSafeMatch(password, ADMIN_PANEL_PASSWORD);
}

export function hasValidAdminSessionToken(value) {
  return timingSafeMatch(value, createSessionToken());
}

export async function hasAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  return hasValidAdminSessionToken(token);
}

export function setAdminSession(response) {
  response.cookies.set(ADMIN_SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}

export function clearAdminSession(response) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export function unauthorizedJson(message = "Admin authentication required.") {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "ADMIN_UNAUTHORIZED",
        message,
      },
    },
    { status: 401 }
  );
}

export function ensureAdminRequest(request) {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!hasValidAdminSessionToken(token)) {
    return unauthorizedJson();
  }

  return null;
}
