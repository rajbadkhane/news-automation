import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_PANEL_SESSION_SECRET } from "@/lib/admin-config";

export const NEWS_TABLE_SESSION_COOKIE = "gts_news_table_client";

const NEWS_TABLE_CLIENTS = [
  {
    id: "gen-h#9",
    password: "gen-h#9",
    name: "GEN-H Client",
  },
];

function timingSafeMatch(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createClientSessionToken(clientId) {
  return crypto
    .createHmac("sha256", ADMIN_PANEL_SESSION_SECRET)
    .update(`gts-news-table:${clientId}`)
    .digest("hex");
}

function serializeClientSession(clientId) {
  return `${clientId}.${createClientSessionToken(clientId)}`;
}

function findClient(clientId) {
  return NEWS_TABLE_CLIENTS.find((client) => timingSafeMatch(client.id, clientId));
}

export function getNewsTableClients() {
  return NEWS_TABLE_CLIENTS.map(({ id, name }) => ({ id, name }));
}

export function validateNewsTableLogin(clientId, password) {
  const client = findClient(String(clientId || "").trim());

  if (!client || !timingSafeMatch(password, client.password)) {
    return null;
  }

  return {
    id: client.id,
    name: client.name,
  };
}

export function hasValidNewsTableSessionToken(value) {
  const [clientId, token] = String(value || "").split(".");
  const client = findClient(clientId);

  if (!client || !token) {
    return false;
  }

  return timingSafeMatch(token, createClientSessionToken(client.id));
}

export async function hasNewsTableSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(NEWS_TABLE_SESSION_COOKIE)?.value;
  return hasValidNewsTableSessionToken(token);
}

export function setNewsTableSession(response, clientId) {
  response.cookies.set(NEWS_TABLE_SESSION_COOKIE, serializeClientSession(clientId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}

export function clearNewsTableSession(response) {
  response.cookies.set(NEWS_TABLE_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export function newsTableUnauthorizedJson(message = "News table login required.") {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "NEWS_TABLE_UNAUTHORIZED",
        message,
      },
    },
    { status: 401 }
  );
}
