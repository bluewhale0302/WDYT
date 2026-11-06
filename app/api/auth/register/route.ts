import { NextResponse } from "next/server";
import { authConfiguration, createAuthClient, normalizeUsername, validUsername } from "@/lib/auth-server";

export async function POST(request: Request) {
  const { url, publicKey, secretKey } = authConfiguration();
  if (!url || !publicKey || !secretKey) return NextResponse.json({ error: "가입 서버 설정이 필요해요." }, { status: 503 });
  let body: { username?: unknown; email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "입력 형식이 올바르지 않아요." }, { status: 400 }); }
  if (!validUsername(body.username) || typeof body.email !== "string" || typeof body.password !== "string" || body.password.length < 12) {
    return NextResponse.json({ error: "사용자 이름은 영문·숫자·밑줄 3~24자, 비밀번호는 12자 이상이어야 해요." }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  const admin = createAuthClient(url, secretKey);
  const { data: taken, error: lookupError } = await admin.from("account_handles").select("user_id").eq("username", username).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "사용자 이름을 확인하지 못했어요. 최신 DB 설정을 적용해 주세요." }, { status: 503 });
  if (taken) return NextResponse.json({ error: "이미 사용 중인 사용자 이름이에요." }, { status: 409 });

  const auth = createAuthClient(url, publicKey);
  const { data, error } = await auth.auth.signUp({
    email: body.email.trim(),
    password: body.password,
    options: { data: { username } },
  });
  if (error || !data.user) return NextResponse.json({ error: "가입할 수 없어요. 이메일을 확인하거나 잠시 후 다시 시도해 주세요." }, { status: 400 });

  const { error: handleError } = await admin.from("account_handles").insert({ user_id: data.user.id, username });
  if (handleError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json({ error: handleError.code === "23505" ? "이미 사용 중인 사용자 이름이에요." : "계정을 준비하지 못했어요. 다시 시도해 주세요." }, { status: handleError.code === "23505" ? 409 : 500 });
  }
  return NextResponse.json({ session: data.session, confirmationRequired: !data.session });
}
