import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export function authConfiguration() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  };
}

export function createAuthClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function currentUser(request: NextRequest) {
  const { url, publicKey } = authConfiguration();
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !publicKey || !token) return null;
  const client = createAuthClient(url, publicKey);
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

export function validUsername(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_]{3,24}$/.test(value);
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}
