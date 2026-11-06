import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const deeplKey = process.env.DEEPL_API_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Supabase 설정이 필요해요." }, { status: 503 });
  if (!serviceKey) return NextResponse.json({ error: "서버용 Supabase 키를 먼저 설정해 주세요." }, { status: 503 });
  if (!deeplKey) return NextResponse.json({ error: "번역 API 키를 먼저 설정해 주세요." }, { status: 503 });

  const supabase = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "로그인 정보를 확인할 수 없어요." }, { status: 401 });

  let payload: { answerId?: string; targetLanguage?: string };
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 }); }

  const answerId = payload.answerId;
  const targetLanguage = payload.targetLanguage?.toUpperCase();
  if (!answerId || !targetLanguage || !/^[A-Z]{2,3}(-[A-Z0-9]{2,8})?$/.test(targetLanguage)) {
    return NextResponse.json({ error: "질문과 대상 언어를 확인해 주세요." }, { status: 400 });
  }

  const { data: answer, error: answerError } = await supabase.from("answers")
    .select("id,body,language,is_public,questions!inner(is_public)").eq("id", answerId).maybeSingle();
  const question = answer?.questions as unknown as { is_public: boolean } | null;
  if (answerError || !answer || !answer.is_public || !question?.is_public) {
    return NextResponse.json({ error: "공개 답변만 번역할 수 있어요." }, { status: 404 });
  }
  if (answer.language.split("-")[0].toUpperCase() === targetLanguage.split("-")[0]) {
    return NextResponse.json({ error: "이미 해당 언어로 작성된 답변이에요." }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: cached } = await admin.from("translations").select("translated_text")
    .eq("answer_id", answerId).eq("target_language", targetLanguage).maybeSingle();
  if (cached) return NextResponse.json({ translatedText: cached.translated_text, cached: true });

  const { count } = await admin.from("translations").select("id", { count: "exact", head: true })
    .eq("created_by", authData.user.id).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= 30) return NextResponse.json({ error: "하루 번역 한도에 도달했어요. 내일 다시 시도해 주세요." }, { status: 429 });

  const endpoint = process.env.DEEPL_API_BASE_URL || "https://api-free.deepl.com";
  let translationResponse: Response;
  try {
    translationResponse = await fetch(`${endpoint}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${deeplKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: [answer.body], target_lang: targetLanguage, source_lang: answer.language.toUpperCase() }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return NextResponse.json({ error: "번역 서비스에 연결하지 못했어요." }, { status: 502 });
  }
  if (!translationResponse.ok) return NextResponse.json({ error: "번역 서비스가 요청을 처리하지 못했어요." }, { status: 502 });
  const result = await translationResponse.json() as { translations?: { text?: string }[] };
  const translatedText = result.translations?.[0]?.text;
  if (!translatedText) return NextResponse.json({ error: "번역 결과가 비어 있어요." }, { status: 502 });

  const { error: insertError } = await admin.from("translations").insert({
    answer_id: answerId,
    source_language: answer.language,
    target_language: targetLanguage,
    translated_text: translatedText,
    provider: "deepl",
    created_by: authData.user.id,
  });
  if (insertError) {
    const { data: concurrentTranslation } = await admin.from("translations").select("translated_text")
      .eq("answer_id", answerId).eq("target_language", targetLanguage).maybeSingle();
    if (!concurrentTranslation) return NextResponse.json({ error: "번역문을 저장하지 못했어요." }, { status: 500 });
    return NextResponse.json({ translatedText: concurrentTranslation.translated_text, cached: true });
  }
  return NextResponse.json({ translatedText, cached: false });
}
