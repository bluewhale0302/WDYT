import { authConfiguration, createAuthClient, currentUser, normalizeUsername, validUsername } from "@/lib/auth-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { url, secretKey } = authConfiguration();
  if (!url || !secretKey) return NextResponse.json({ error: "사용자 이름 서버 설정이 필요해요." }, { status: 503 });
  const admin = createAuthClient(url, secretKey);
  const { data, error } = await admin.from("account_handles").select("username").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "사용자 이름을 확인하지 못했어요." }, { status: 500 });
  return NextResponse.json({ username: data?.username ?? null });
}

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { url, secretKey } = authConfiguration();
  if (!url || !secretKey) return NextResponse.json({ error: "사용자 이름 서버 설정이 필요해요." }, { status: 503 });
  let body: { username?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "사용자 이름 형식이 올바르지 않아요." }, { status: 400 }); }
  if (!validUsername(body.username)) return NextResponse.json({ error: "사용자 이름은 영문·숫자·밑줄 3~24자로 입력해 주세요." }, { status: 400 });

  const admin = createAuthClient(url, secretKey);
  const username = normalizeUsername(body.username);
  const { data: existing, error: lookupError } = await admin.from("account_handles").select("username").eq("user_id", user.id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "사용자 이름을 확인하지 못했어요." }, { status: 500 });
  if (existing) return existing.username === username
    ? NextResponse.json({ username: existing.username })
    : NextResponse.json({ error: "사용자 이름은 한 번 정하면 바꿀 수 없어요." }, { status: 409 });

  const { error } = await admin.from("account_handles").insert({ user_id: user.id, username });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "이미 사용 중인 사용자 이름이에요." : "사용자 이름을 저장하지 못했어요." }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ username });
}
