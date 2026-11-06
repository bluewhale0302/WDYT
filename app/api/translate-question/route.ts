import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const deeplKey = process.env.DEEPL_API_KEY;
  if (!url || !publishableKey || !secretKey) return NextResponse.json({ error: "Supabase 서버 설정이 필요해요." }, { status: 503 });
  if (!deeplKey) return NextResponse.json({ error: "번역 API 키를 먼저 설정해 주세요." }, { status: 503 });

  const userClient = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "로그인 정보를 확인할 수 없어요." }, { status: 401 });

  let payload: { questionId?: string; targetLanguage?: string };
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "요청 형식이 올바르지 않아요." }, { status: 400 }); }
  const questionId = payload.questionId;
  const targetLanguage = payload.targetLanguage?.toUpperCase();
  if (!questionId || !targetLanguage || !/^[A-Z]{2,3}(-[A-Z0-9]{2,8})?$/.test(targetLanguage)) {
    return NextResponse.json({ error: "질문과 대상 언어를 확인해 주세요." }, { status: 400 });
  }

  const { data: question, error: questionError } = await userClient.from("questions")
    .select("id,title,body,language,is_public").eq("id", questionId).maybeSingle();
  if (questionError || !question || !question.is_public) return NextResponse.json({ error: "공개 질문만 번역할 수 있어요." }, { status: 404 });
  if (question.language.split("-")[0].toUpperCase() === targetLanguage.split("-")[0]) return NextResponse.json({ error: "이미 해당 언어로 작성된 질문이에요." }, { status: 400 });

  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: cached } = await admin.from("question_translations").select("translated_title,translated_body")
    .eq("question_id", questionId).eq("target_language", targetLanguage).maybeSingle();
  if (cached) return NextResponse.json({ translatedTitle: cached.translated_title, translatedBody: cached.translated_body, cached: true });

  const { count } = await admin.from("question_translations").select("id", { count: "exact", head: true })
    .eq("created_by", authData.user.id).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  if ((count ?? 0) >= 30) return NextResponse.json({ error: "하루 번역 한도에 도달했어요. 내일 다시 시도해 주세요." }, { status: 429 });

  const endpoint = process.env.DEEPL_API_BASE_URL || "https://api-free.deepl.com";
  const sourceText = question.body ? [question.title, question.body] : [question.title];
  let translationResponse: Response;
  try {
    translationResponse = await fetch(`${endpoint}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${deeplKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: sourceText, target_lang: targetLanguage, source_lang: question.language.toUpperCase() }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return NextResponse.json({ error: "번역 서비스에 연결하지 못했어요." }, { status: 502 });
  }
  if (!translationResponse.ok) return NextResponse.json({ error: "번역 서비스가 요청을 처리하지 못했어요." }, { status: 502 });
  const result = await translationResponse.json() as { translations?: { text?: string }[] };
  const translatedTitle = result.translations?.[0]?.text;
  if (!translatedTitle) return NextResponse.json({ error: "번역 결과가 비어 있어요." }, { status: 502 });
  const translatedBody = question.body ? result.translations?.[1]?.text ?? "" : "";

  const { error: insertError } = await admin.from("question_translations").insert({
    question_id: questionId,
    source_language: question.language,
    target_language: targetLanguage,
    translated_title: translatedTitle,
    translated_body: translatedBody,
    provider: "deepl",
    created_by: authData.user.id,
  });
  if (insertError) {
    const { data: concurrentTranslation } = await admin.from("question_translations").select("translated_title,translated_body")
      .eq("question_id", questionId).eq("target_language", targetLanguage).maybeSingle();
    if (!concurrentTranslation) return NextResponse.json({ error: "번역문을 저장하지 못했어요." }, { status: 500 });
    return NextResponse.json({ translatedTitle: concurrentTranslation.translated_title, translatedBody: concurrentTranslation.translated_body, cached: true });
  }
  return NextResponse.json({ translatedTitle, translatedBody, cached: false });
}
