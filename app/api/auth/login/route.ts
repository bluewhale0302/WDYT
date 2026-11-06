import { createAuthClient, authConfiguration, normalizeUsername, validUsername } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";

const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(request: NextRequest) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) { attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 }); return false; }
  current.count += 1;
  return current.count > 10;
}

export async function POST(request: NextRequest) {
  if (isRateLimited(request)) return NextResponse.json({ error: "로그인 시도가 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  const { url, publicKey, secretKey } = authConfiguration();
  if (!url || !publicKey || !secretKey) return NextResponse.json({ error: "로그인 서버 설정이 필요해요." }, { status: 503 });
  let body: { username?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "사용자 이름이나 비밀번호를 확인해 주세요." }, { status: 400 }); }
  if (!validUsername(body.username) || typeof body.password !== "string" || !body.password) {
    return NextResponse.json({ error: "사용자 이름이나 비밀번호를 확인해 주세요." }, { status: 400 });
  }

  const admin = createAuthClient(url, secretKey);
  const username = normalizeUsername(body.username);
  const { data: handle } = await admin.from("account_handles").select("user_id").eq("username", username).maybeSingle();
  if (!handle) return NextResponse.json({ error: "사용자 이름이나 비밀번호를 확인해 주세요." }, { status: 401 });
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(handle.user_id);
  const email = userData.user?.email;
  if (userError || !email) return NextResponse.json({ error: "사용자 이름이나 비밀번호를 확인해 주세요." }, { status: 401 });

  const auth = createAuthClient(url, publicKey);
  const { data, error } = await auth.auth.signInWithPassword({ email, password: body.password });
  if (error || !data.session) return NextResponse.json({ error: "사용자 이름이나 비밀번호를 확인해 주세요." }, { status: 401 });
  return NextResponse.json({ session: data.session });
}
