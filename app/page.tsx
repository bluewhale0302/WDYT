"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";

const categories = ["전체", "자아와 심리", "인간관계", "철학과 삶", "사회와 미래", "일상과 관심사"];
const languages = [["ko","한국어"],["en","English"],["ja","日本語"],["zh","中文"],["es","Español"],["fr","Français"],["de","Deutsch"],["pt","Português"],["ar","العربية"],["id","Bahasa Indonesia"]];
const translationTargets: Record<string, string> = { ko: "KO", en: "EN-US", ja: "JA", zh: "ZH", es: "ES", fr: "FR", de: "DE", pt: "PT-BR", ar: "AR", id: "ID" };
type Question = { id: string; title: string; body: string; category: string; language: string; country_code?: string | null; author_id: string; deleted_at?: string | null; created_at: string; is_public?: boolean; answers?: { count: number }[] };
type ReactionKind = "helpful" | "relate" | "perspective";
type Answer = { id: string; body: string; created_at: string; is_public: boolean; language: string; author_id: string; answer_reactions?: { id: string; user_id: string; reaction: ReactionKind }[]; translations?: { target_language: string; translated_text: string }[] };
type JournalAnswer = Answer & { question_id: string; questions: { id: string; title: string; category: string } | null };
type Profile = { display_name: string; bio: string; is_public: boolean; preferred_language: string; country_code: string };
type SavedStatus = "to_answer" | "answered" | "revisit";

export default function Home() {
  const supabase = getSupabase();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selected, setSelected] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [category, setCategory] = useState("전체");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("");
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [usernameInput, setUsernameInput] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [rememberUsername, setRememberUsername] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [journalTab, setJournalTab] = useState<"saved" | "questions" | "answers" | "profile" | "blocked">("saved");
  const [savedQuestions, setSavedQuestions] = useState<Question[]>([]);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);
  const [myAnswers, setMyAnswers] = useState<JournalAnswer[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedStatuses, setSavedStatuses] = useState<Record<string, SavedStatus>>({});
  const [savedStatusFilter, setSavedStatusFilter] = useState<"all" | SavedStatus>("all");
  const [comparison, setComparison] = useState<{ title: string; older: JournalAnswer; newer: JournalAnswer } | null>(null);
  const [profile, setProfile] = useState<Profile>({ display_name: "", bio: "", is_public: false, preferred_language: "en", country_code: "" });
  const [savedProfile, setSavedProfile] = useState<Profile>({ display_name: "", bio: "", is_public: false, preferred_language: "en", country_code: "" });
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [reactionBusy, setReactionBusy] = useState<Set<string>>(new Set());
  const submitLock = useRef(false);
  const reactionLock = useRef(new Set<string>());

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("wdyt.username");
      if (saved) { setUsernameInput(saved); setRememberUsername(true); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [screen, setScreen] = useState<"explore" | "journal">("explore");
  const [translationByAnswer, setTranslationByAnswer] = useState<Record<string, string>>({});
  const [shownTranslations, setShownTranslations] = useState<Set<string>>(new Set());
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const [questionTranslation, setQuestionTranslation] = useState<{ questionId: string; title: string; body: string } | null>(null);
  const [showQuestionTranslation, setShowQuestionTranslation] = useState(false);
  const [translatingQuestion, setTranslatingQuestion] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: "question" | "answer"; id: string; excerpt: string } | null>(null);
  const [reportNotice, setReportNotice] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; display_name: string; reason: string }[]>([]);
  const [blockTarget, setBlockTarget] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [accountUsername, setAccountUsername] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSavedNotice, setProfileSavedNotice] = useState("");
  const [isModerator, setIsModerator] = useState(false);

  useEffect(() => {
    if (!profileSavedNotice) return;
    const timer = window.setTimeout(() => setProfileSavedNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [profileSavedNotice]);

  const loadQuestions = useCallback(async () => {
    if (!supabase) return;
    let query = supabase.from("questions").select("id,title,body,category,language,country_code,author_id,deleted_at,created_at,is_public,answers(count)").eq("is_public", true).order("created_at", { ascending: false }).limit(40);
    if (category !== "전체") query = query.eq("category", category);
    if (languageFilter !== "all") query = query.eq("language", languageFilter);
    if (countryFilter) query = query.eq("country_code", countryFilter);
    const { data, error } = await query;
    if (!error && data) setQuestions(data as Question[]);
  }, [supabase, category, languageFilter, countryFilter]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id, email: data.user.email } : null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ? { id: session.user.id, email: session.user.email } : null;
      setUser(nextUser);
      if (!nextUser) { setScreen("explore"); setSavedQuestions([]); setMyQuestions([]); setMyAnswers([]); setSavedIds(new Set()); setBlockedUsers([]); setIsModerator(false); setOnboardingRequired(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);
  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const response = await fetch("/api/moderation", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (active) setIsModerator(response.ok);
    }).catch(() => { if (active) setIsModerator(false); });
    return () => { active = false; };
  }, [supabase, user]);
  useEffect(() => {
    if (!supabase || !user) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const response = await fetch("/api/auth/handle", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (!active || !response.ok) return;
      const result = await response.json() as { username: string | null };
      setAccountUsername(result.username ?? "");
      if (!result.username) { setOnboardingRequired(true); setProfileEditing(true); setScreen("journal"); setJournalTab("profile"); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, [supabase, user]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadQuestions(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQuestions, refresh]);
  useEffect(() => {
    if (!supabase || !selected) return;
    // RLS returns public answers and only the current author's private answers.
    supabase.from("answers").select("id,body,created_at,is_public,language,author_id,answer_reactions(id,user_id,reaction),translations(target_language,translated_text)").eq("question_id", selected.id).order("created_at", { ascending: false }).then(({ data }) => setAnswers((data ?? []) as Answer[]));
  }, [supabase, selected, refresh]);
  useEffect(() => {
    if (!supabase || !selected || !selected.is_public) return;
    supabase.from("question_translations").select("target_language,translated_title,translated_body")
      .eq("question_id", selected.id).then(({ data }) => {
        const target = translationTargets[profile.preferred_language] ?? "EN-US";
        const cached = data?.find((item) => item.target_language === target);
        if (cached) setQuestionTranslation({ questionId: selected.id, title: cached.translated_title, body: cached.translated_body });
      });
  }, [supabase, selected, profile.preferred_language]);
  useEffect(() => {
    if (!supabase || !user) return;
    const client = supabase;
    const currentUser = user;
    let active = true;
    async function loadJournal() {
      const [saved, ownQuestions, ownAnswers, ownProfile, blocks] = await Promise.all([
        client.from("saved_questions").select("saved_at,status,questions(id,title,body,category,language,country_code,author_id,deleted_at,created_at,is_public,answers(count))").eq("user_id", currentUser.id).order("saved_at", { ascending: false }),
        client.from("questions").select("id,title,body,category,language,country_code,author_id,deleted_at,created_at,is_public,answers(count)").eq("author_id", currentUser.id).order("created_at", { ascending: false }),
        client.from("answers").select("id,question_id,body,created_at,is_public,language,author_id,questions(id,title,category)").eq("author_id", currentUser.id).order("created_at", { ascending: false }),
        client.from("profiles").select("display_name,bio,is_public,preferred_language,country_code").eq("id", currentUser.id).maybeSingle(),
        client.from("user_blocks").select("blocked_id,reason").eq("blocker_id", currentUser.id).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      const savedRows = (saved.data ?? []) as unknown as { status: SavedStatus; questions: Question | null }[];
      const questions = savedRows.flatMap((row) => row.questions ? [row.questions] : []);
      setSavedQuestions(questions); setSavedIds(new Set(questions.map((q) => q.id)));
      setSavedStatuses(Object.fromEntries(savedRows.filter((row) => row.questions).map((row) => [row.questions!.id, row.status])));
      setMyQuestions((ownQuestions.data ?? []) as Question[]);
      setMyAnswers((ownAnswers.data ?? []) as unknown as typeof myAnswers);
      const blockIds = (blocks.data ?? []).map((item) => item.blocked_id);
      const { data: publicProfiles } = blockIds.length ? await client.from("profiles").select("id,display_name").in("id", blockIds) : { data: [] };
      const profileNames = new Map((publicProfiles ?? []).map((item) => [item.id, item.display_name]));
      setBlockedUsers((blocks.data ?? []).map((item) => ({ id: item.blocked_id, display_name: profileNames.get(item.blocked_id) || `사용자 ${item.blocked_id.slice(0, 6)}`, reason: item.reason ?? "" })));
      if (ownProfile.data) {
        const nextProfile = { ...ownProfile.data, country_code: ownProfile.data.country_code ?? "" } as Profile;
        setProfile(nextProfile); setSavedProfile(nextProfile); setProfileEditing(false);
        setOnboardingRequired(false);
      } else if (!ownProfile.error) {
        const nextProfile = { display_name: currentUser.email?.split("@")[0].slice(0, 50) ?? "", bio: "", is_public: false, preferred_language: "en", country_code: "" };
        setProfile(nextProfile); setSavedProfile(nextProfile); setProfileEditing(true);
        setOnboardingRequired(true); setScreen("journal"); setJournalTab("profile");
      }
    }
    void loadJournal();
    return () => { active = false; };
  }, [supabase, user, refresh]);

  async function toggleSaved(question: Question) {
    if (!supabase || !user) { setAuthOpen(true); return; }
    const alreadySaved = savedIds.has(question.id);
    const result = alreadySaved
      ? await supabase.from("saved_questions").delete().eq("user_id", user.id).eq("question_id", question.id)
      : await supabase.from("saved_questions").insert({ user_id: user.id, question_id: question.id });
    if (result.error) setNotice(result.error.message);
    else { setNotice(alreadySaved ? "저장 목록에서 뺐어요." : "나를 알아가는 질문에 저장했어요."); setRefresh((n) => n + 1); }
  }

  async function updateSavedStatus(questionId: string, status: SavedStatus) {
    if (!supabase || !user) return;
    const { error } = await supabase.from("saved_questions").update({ status }).eq("user_id", user.id).eq("question_id", questionId);
    if (error) setNotice(error.message); else { setSavedStatuses((previous) => ({ ...previous, [questionId]: status })); setNotice("질문 상태를 바꿨어요."); }
  }

  async function blockUser(userId: string, reason: string) {
    if (!supabase || !user) { setAuthOpen(true); return; }
    if (user.id === userId) return;
    const { error } = await supabase.from("user_blocks").insert({ blocker_id: user.id, blocked_id: userId, reason: reason.trim().slice(0, 500) });
    if (error && error.code !== "23505") setNotice(error.message);
    else { setNotice("사용자를 차단하고 이유를 기록했어요."); setSelected(null); setBlockTarget(null); setBlockReason(""); setRefresh((n) => n + 1); }
  }

  async function unblockUser(userId: string) {
    if (!supabase || !user) return;
    const { error } = await supabase.from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", userId);
    if (error) setNotice(error.message); else { setBlockedUsers((previous) => previous.filter((blocked) => blocked.id !== userId)); setNotice("차단을 해제했어요."); setRefresh((n) => n + 1); }
  }

  async function deleteQuestion(question: Question) {
    if (!supabase || !user || question.author_id !== user.id || question.deleted_at) return;
    const confirmed = window.confirm("질문 원문은 삭제되고 질문과 답변은 공개에서 숨겨집니다. 답변은 각 작성자의 개인 기록에 남습니다. 삭제할까요?");
    if (!confirmed) return;
    const { error } = await supabase.from("questions").update({ title: "삭제된 질문", body: "", is_public: false, deleted_at: new Date().toISOString() }).eq("id", question.id);
    if (error) setNotice(error.message); else { setNotice("질문을 공개 목록에서 숨기고 원문을 삭제했어요."); setRefresh((n) => n + 1); }
  }

  async function deleteAnswer(answer: JournalAnswer) {
    if (!supabase || !user || answer.author_id !== user.id) return;
    if (!window.confirm("이 답변을 삭제할까요? 답변과 연결된 반응 및 번역도 함께 삭제됩니다.")) return;
    const { error } = await supabase.from("answers").delete().eq("id", answer.id);
    if (error) setNotice(error.message); else { setNotice("답변을 삭제했어요."); setRefresh((n) => n + 1); }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !reportTarget) return;
    if (!user) { setAuthMode("login"); setAuthOpen(true); return; }
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("content_reports").insert({ reporter_id: user.id, target_type: reportTarget.type, target_id: reportTarget.id, content_excerpt: reportTarget.excerpt.slice(0,5000), reason: form.get("reason"), details: form.get("details") });
    if (error?.code === "23505") setReportNotice("이미 이 콘텐츠를 신고했어요.");
    else if (error) setReportNotice("신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.");
    else { setReportNotice("신고가 접수됐어요. 검토하겠습니다."); setReportTarget(null); setNotice("신고가 접수됐어요."); }
  }

  function compareAnswers(title: string, history: JournalAnswer[]) {
    const ordered = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    if (ordered.length >= 2) setComparison({ title, older: ordered[0], newer: ordered.at(-1)! });
  }

  async function setVisibility(kind: "questions" | "answers", id: string, isPublic: boolean) {
    if (!supabase) return;
    const { error } = await supabase.from(kind).update({ is_public: isPublic }).eq("id", id);
    if (error) setNotice(error.message); else { setNotice(isPublic ? "공개로 변경했어요." : "나만 보기로 변경했어요."); setRefresh((n) => n + 1); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !user) return;
    if (busy) return;
    setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    const countryCode = String(form.get("country_code") ?? "").trim().toUpperCase();
    const updated = { id: user.id, display_name: String(form.get("display_name")), bio: String(form.get("bio")), is_public: form.get("is_public") === "on", preferred_language: String(form.get("preferred_language")), country_code: countryCode || null };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setNotice("로그인이 필요해요. 다시 로그인해 주세요."); return; }
      const handleResponse = await fetch("/api/auth/handle", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ username: accountUsername }) });
      const handleResult = await handleResponse.json() as { username?: string; error?: string };
      if (!handleResponse.ok || !handleResult.username) { setNotice(handleResult.error ?? "사용자 이름을 저장하지 못했어요."); return; }
      setAccountUsername(handleResult.username);
      const { error } = await supabase.from("profiles").upsert(updated);
      if (error) { setNotice(error.code === "42501" ? "프로필 저장 권한이 없어요. 최신 supabase/schema.sql을 적용했는지 확인해 주세요." : error.message); return; }
      const nextProfile = { ...updated, country_code: updated.country_code ?? "" };
      setProfile(nextProfile); setSavedProfile(nextProfile); setProfileEditing(false); setOnboardingRequired(false);
      setQuestionTranslation(null); setShowQuestionTranslation(false); setTranslationByAnswer({}); setShownTranslations(new Set());
      setNotice(""); setProfileSavedNotice("프로필 설정을 저장했어요."); setRefresh((n) => n + 1);
      if (onboardingRequired) setScreen("explore");
    } catch { setNotice("프로필을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function toggleReaction(answer: Answer, reaction: ReactionKind) {
    if (!supabase || !user) { setAuthOpen(true); return; }
    const reactionKey = `${answer.id}:${reaction}`;
    if (reactionLock.current.has(reactionKey)) return;
    reactionLock.current.add(reactionKey);
    setReactionBusy((previous) => new Set(previous).add(reactionKey));
    const existing = answer.answer_reactions?.find((item) => item.user_id === user.id && item.reaction === reaction);
    try {
      const result = existing
        ? await supabase.from("answer_reactions").delete().eq("id", existing.id)
        : await supabase.from("answer_reactions").insert({ answer_id: answer.id, user_id: user.id, reaction });
      if (result.error) {
        setNotice(result.error.code === "42501" ? "이 답변에 반응을 남길 수 없어요. 공개 답변인지, 질문 작성자와 차단 관계가 없는지 확인해 주세요." : result.error.code === "23505" ? "이미 남긴 반응이에요." : "반응을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      } else {
        setAnswers((items) => items.map((item) => item.id !== answer.id ? item : { ...item, answer_reactions: existing ? (item.answer_reactions ?? []).filter((reactionItem) => reactionItem.id !== existing.id) : [...(item.answer_reactions ?? []), { id: `local-${Date.now()}`, user_id: user.id, reaction }] }));
        setNotice(existing ? "반응을 취소했어요." : "반응을 남겼어요."); setRefresh((n) => n + 1);
      }
    } catch { setNotice("반응을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { reactionLock.current.delete(reactionKey); setReactionBusy((previous) => { const next = new Set(previous); next.delete(reactionKey); return next; }); }
  }

  async function translateAnswer(answer: Answer) {
    if (!supabase || !user) { setAuthOpen(true); return; }
    const targetLanguage = translationTargets[profile.preferred_language] ?? "EN-US";
    if (answer.language.split("-")[0].toLowerCase() === profile.preferred_language) { setNotice("이 답변은 이미 선호 번역 언어로 작성되어 있어요."); return; }
    if (translationByAnswer[answer.id]) {
      setShownTranslations((previous) => {
        const next = new Set(previous);
        if (next.has(answer.id)) next.delete(answer.id);
        else next.add(answer.id);
        return next;
      });
      return;
    }
    const cached = answer.translations?.find((item) => item.target_language === targetLanguage);
    if (cached) { setTranslationByAnswer((previous) => ({ ...previous, [answer.id]: cached.translated_text })); setShownTranslations((previous) => new Set(previous).add(answer.id)); return; }
    setTranslatingId(answer.id); setNotice("");
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch("/api/translate-answer", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token ?? ""}` }, body: JSON.stringify({ answerId: answer.id, targetLanguage }) });
    const result = await response.json() as { translatedText?: string; error?: string };
    setTranslatingId(null);
    if (!response.ok || !result.translatedText) { setNotice(result.error ?? "번역하지 못했어요."); return; }
    setTranslationByAnswer((previous) => ({ ...previous, [answer.id]: result.translatedText! }));
    setShownTranslations((previous) => new Set(previous).add(answer.id));
  }

  async function translateQuestion() {
    if (!selected || !supabase || !user) { setAuthOpen(true); return; }
    if (questionTranslation?.questionId === selected.id) { setShowQuestionTranslation((previous) => !previous); return; }
    setTranslatingQuestion(true); setNotice("");
    const { data: sessionData } = await supabase.auth.getSession();
    const targetLanguage = translationTargets[profile.preferred_language] ?? "EN-US";
    if (selected.language.split("-")[0].toLowerCase() === profile.preferred_language) { setTranslatingQuestion(false); setNotice("이 질문은 이미 선호 번역 언어로 작성되어 있어요."); return; }
    const response = await fetch("/api/translate-question", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token ?? ""}` }, body: JSON.stringify({ questionId: selected.id, targetLanguage }) });
    const result = await response.json() as { translatedTitle?: string; translatedBody?: string; error?: string };
    setTranslatingQuestion(false);
    if (!response.ok || !result.translatedTitle) { setNotice(result.error ?? "질문을 번역하지 못했어요."); return; }
    setQuestionTranslation({ questionId: selected.id, title: result.translatedTitle, body: result.translatedBody ?? "" });
    setShowQuestionTranslation(true);
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? usernameInput).trim();
    const password = String(form.get("password") ?? "");
    try {
      if (authMode === "signup") {
        const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, email: form.get("email"), password }) });
        const result = await response.json() as { session?: { access_token: string; refresh_token: string } | null; confirmationRequired?: boolean; error?: string };
        if (!response.ok) { setNotice(result.error ?? "가입을 완료하지 못했어요."); return; }
        setUsernameInput(username);
        if (result.session) {
          const { error } = await supabase.auth.setSession(result.session);
          if (error) { setNotice("가입은 됐지만 로그인하지 못했어요. 사용자 이름으로 로그인해 주세요."); setAuthMode("login"); return; }
          setAuthPassword(""); setAuthOpen(false); setAuthMode("login"); setProfileEditing(true); setNotice("가입했어요. 기본 설정을 이어서 입력해 주세요.");
        } else {
          setAuthPassword(""); setAuthMode("login"); setNotice("인증 메일을 확인한 뒤 사용자 이름으로 로그인해 주세요.");
        }
      } else {
        if (rememberUsername) window.localStorage.setItem("wdyt.username", username);
        else window.localStorage.removeItem("wdyt.username");
        const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        const result = await response.json() as { session?: { access_token: string; refresh_token: string }; error?: string };
        if (!response.ok || !result.session) { setNotice(result.error ?? "사용자 이름이나 비밀번호를 확인해 주세요."); return; }
        const { error } = await supabase.auth.setSession(result.session);
        if (error) { setNotice("로그인을 완료하지 못했어요. 다시 시도해 주세요."); return; }
        setAuthPassword(""); setAuthOpen(false); setNotice("로그인했어요.");
      }
    } catch { setNotice("연결이 잠시 끊겼어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  async function signInWithProvider(provider: "google" | "kakao") {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
    if (error) { setBusy(false); setNotice("간편 로그인을 시작하지 못했어요. Supabase에서 해당 제공자를 설정했는지 확인해 주세요."); }
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !user) { setAuthOpen(true); return; }
    if (submitLock.current) return;
    submitLock.current = true; setBusy(true); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const countryCode = String(form.get("country_code") ?? "").trim().toUpperCase() || profile.country_code || null;
    try {
      const { data, error } = await supabase.from("questions").insert({ title: form.get("title"), body: form.get("body"), category: form.get("category"), language: form.get("language"), country_code: countryCode, author_id: user.id, is_public: form.get("is_public") === "on" }).select("id,title,body,category,language,country_code,author_id,deleted_at,created_at,is_public").single();
      if (error) setNotice(error.code === "42501" ? "질문을 등록할 권한이 없어요. 로그인 상태와 최신 DB 정책을 확인해 주세요." : "질문을 등록하지 못했어요. 입력 내용을 확인한 뒤 다시 시도해 주세요.");
      else {
        formElement.reset(); setCategory("전체"); setLanguageFilter("all"); setCountryFilter("");
        setQuestions((items) => [data as Question, ...items.filter((item) => item.id !== data.id)].slice(0, 40));
        setNotice("질문을 등록했어요."); setRefresh((n) => n + 1);
      }
    } catch { setNotice("연결이 잠시 끊겨 질문을 등록하지 못했어요. 목록을 확인한 뒤 다시 시도해 주세요."); }
    finally { submitLock.current = false; setBusy(false); }
  }

  async function createAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !user || !selected) { setAuthOpen(true); return; }
    if (submitLock.current) return;
    submitLock.current = true; setBusy(true); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const { data, error } = await supabase.from("answers").insert({ question_id: selected.id, body: form.get("body"), language: "ko", author_id: user.id, is_public: form.get("is_public") === "on" }).select("id,body,created_at,is_public,language,author_id").single();
      if (error) setNotice(error.code === "42501" ? "답변을 등록할 권한이 없어요. 질문이 공개 상태인지, 차단 관계가 없는지 확인해 주세요." : "답변을 등록하지 못했어요. 잠시 후 다시 시도해 주세요.");
      else {
        await supabase.from("saved_questions").update({ status: "answered" }).eq("user_id", user.id).eq("question_id", selected.id);
        formElement.reset(); setAnswers((items) => [data as Answer, ...items.filter((item) => item.id !== data.id)]);
        setNotice("답변을 기록했어요."); setRefresh((n) => n + 1);
      }
    } catch { setNotice("연결이 잠시 끊겨 답변을 등록하지 못했어요. 다시 시도해 주세요."); }
    finally { submitLock.current = false; setBusy(false); }
  }

  const filteredSavedQuestions = savedQuestions.filter((question) => savedStatusFilter === "all" || (savedStatuses[question.id] ?? "to_answer") === savedStatusFilter);
  const answerGroups = myAnswers.reduce<Record<string, JournalAnswer[]>>((groups, answer) => {
    (groups[answer.question_id] ??= []).push(answer);
    return groups;
  }, {});
  const currentQuestionTranslation = selected && questionTranslation?.questionId === selected.id ? questionTranslation : null;
  const currentQuestionTranslationShown = showQuestionTranslation && !!currentQuestionTranslation;
  const preferredLanguageLabel = languages.find(([code]) => code === profile.preferred_language)?.[1] ?? profile.preferred_language.toUpperCase();
  return <main className="shell">
    {profileSavedNotice && <div className="profile-save-toast" role="status">{profileSavedNotice}<button type="button" aria-label="알림 닫기" onClick={() => setProfileSavedNotice("")}>×</button></div>}
    <header className="topbar"><a className="brand" href="#top" onClick={() => setScreen("explore")}><span className="brand-mark">w</span> wdyt<span className="brand-dot">.</span></a><nav><button className={screen === "explore" ? "nav-active" : ""} onClick={() => setScreen("explore")}>탐색</button><a href={screen === "explore" ? "#write" : undefined} onClick={() => setScreen("explore")}>질문하기</a></nav><div className="account">{user ? <>{isModerator && <a className="text-button moderator-link" href="/moderation">신고 검토</a>}<button className={screen === "journal" ? "text-button current" : "text-button"} onClick={() => setScreen("journal")}>내 기록</button><span className="user-email">{user.email}</span><button className="text-button" onClick={() => void supabase?.auth.signOut()}>로그아웃</button></> : <button className="login-button" onClick={() => { setAuthMode("login"); setAuthOpen(true); }}>로그인 <span>↗</span></button>}</div></header>
    {screen === "explore" && <><section className="hero" id="top"><div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> A PLACE FOR THOUGHTFUL EXCHANGE</div><h1>생각을 나누고,<br /><em>나를 알아가다.</em></h1><p>좋은 질문 하나가 새로운 생각을 열어줍니다.<br />세상의 다양한 관점 속에서 당신의 이야기를 찾아보세요.</p><a className="hero-link" href="#explore">질문 둘러보기 <span>↓</span></a></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="thought thought-a">다른 사람은<br />어떻게 생각할까?</div><div className="thought thought-b">나는 왜<br />이렇게 느낄까?</div><div className="core">내 생각의<br /><strong>시작</strong></div><span className="spark spark-a">✳</span><span className="spark spark-b">✳</span></div><span className="hero-index">01 — 05</span></section>
    <section className="explore section" id="explore"><div className="section-head"><div><div className="eyebrow muted">DISCOVER A QUESTION</div><h2>오늘의 생각을 열어줄 질문</h2><p>낯선 질문에서 나만의 답을 발견해 보세요.</p></div><span className="count-pill">{questions.length} QUESTIONS <i>↗</i></span></div><div className="filters">{categories.map((item) => <button key={item} className={item === category ? "filter active" : "filter"} onClick={() => setCategory(item)}>{item}</button>)}<label className="feed-filter"><span>언어</span><select value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}><option value="all">모두</option>{languages.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label><label className="feed-filter"><span>국가</span><input value={countryFilter} onChange={(e) => setCountryFilter(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0,2))} placeholder="모두" maxLength={2} aria-label="국가 코드 필터" /></label><span className="sort-label">최신순 <span>⌄</span></span></div>
      {!supabase ? <div className="empty-state"><span>✳</span><h3>연결 준비가 필요해요</h3><p>Supabase 프로젝트 키를 설정하면 질문 목록과 가입 기능이 연결됩니다.</p></div> : questions.length === 0 ? <div className="empty-state"><span>✳</span><h3>조건에 맞는 질문이 아직 없어요</h3><p>언어나 국가 필터를 바꾸거나 첫 질문을 남겨보세요.</p></div> : <div className="question-grid">{questions.map((q, index) => <article className="question-card" key={q.id}><button className="card-open" onClick={() => setSelected(q)}><div className="card-meta"><span className={`category-dot dot-${index % 5}`} />{q.category}<span className="meta-sep">·</span>{languages.find(([code]) => code === q.language)?.[1] ?? q.language.toUpperCase()}{q.country_code && <><span className="meta-sep">·</span>{q.country_code}</>}<span className="card-arrow">↗</span></div><h3>{q.title}</h3><p>{q.body}</p></button><div className="card-foot"><span>{new Date(q.created_at).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</span><span className="answer-count">◌ &nbsp;{q.answers?.[0]?.count ?? 0}개의 생각</span><button className={savedIds.has(q.id) ? "save-question saved" : "save-question"} onClick={() => void toggleSaved(q)} title="나를 알아가는 질문에 저장">{savedIds.has(q.id) ? "저장됨 ✓" : "＋ 저장"}</button></div></article>)}</div>}
    </section>
    <section className="write-section section" id="write"><div className="write-intro"><div className="eyebrow muted">START A CONVERSATION</div><h2>마음속 질문을<br />세상과 나눠보세요.</h2><p>정답이 없는 질문일수록<br />더 많은 생각이 모입니다.</p><span className="write-number">02 / YOUR TURN</span></div><form className="question-form" onSubmit={createQuestion}><label>질문 제목<input name="title" required maxLength={160} placeholder="당신이 궁금한 것을 물어보세요" /></label><label>조금 더 들려주세요 <span className="optional">선택</span><textarea name="body" maxLength={3000} placeholder="이 질문을 떠올리게 된 이야기가 있나요?" rows={3}/></label><div className="form-row global-meta"><label>작성 언어<select name="language" defaultValue="ko">{languages.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label><label>국가 코드 <span className="optional">선택 · 예: KR, US, JP</span><input name="country_code" list="wdyt-countries" maxLength={2} pattern="[A-Za-z]{2}" placeholder="국가를 선택하거나 코드 입력" /><datalist id="wdyt-countries"><option value="KR" label="대한민국"/><option value="US" label="미국"/><option value="JP" label="일본"/><option value="CN" label="중국"/><option value="IN" label="인도"/><option value="GB" label="영국"/><option value="DE" label="독일"/><option value="FR" label="프랑스"/><option value="BR" label="브라질"/><option value="CA" label="캐나다"/><option value="AU" label="호주"/><option value="ID" label="인도네시아"/><option value="VN" label="베트남"/><option value="MX" label="멕시코"/></datalist></label></div><div className="form-row"><label>주제<select name="category" required>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label className="visibility"><input name="is_public" type="checkbox" defaultChecked /><span>모두에게 공개</span></label></div><button className="submit-button" disabled={busy}>{busy ? "등록 중…" : "질문 등록하기"}<span>↗</span></button>{notice && <p className="notice">{notice}</p>}</form></section></>}
    {screen === "journal" && <section className="journal section"><div className="section-head"><div><div className="eyebrow muted">YOUR THOUGHT JOURNAL</div><h2>{onboardingRequired ? "기본 설정" : "나를 알아가는 기록"}</h2><p>{onboardingRequired ? "번역 언어와 나라를 선택하면 가입이 완료돼요." : "저장한 질문과 내가 남긴 생각을 한곳에서 살펴보세요."}</p></div><span className="count-pill">{myQuestions.length + myAnswers.length} MY ENTRIES</span></div>{onboardingRequired && <div className="onboarding-note">계정에서 선호 번역 언어와 나라를 설정할 수 있어요. 설정은 나중에 언제든지 바꿀 수 있습니다.</div>}<div className="journal-tabs">{([["saved","저장한 질문"],["questions","내 질문"],["answers","내 답변"],["profile","프로필"],["blocked","차단 목록"]] as const).filter(([key]) => !onboardingRequired || key === "profile").map(([key,label]) => <button className={journalTab === key ? "journal-tab active" : "journal-tab"} key={key} onClick={() => setJournalTab(key)}>{label}</button>)}</div>
      {journalTab === "saved" && <><div className="filters journal-status-filters">{([["all","모두"],["to_answer","답변 전"],["answered","답변 완료"],["revisit","다시 생각하기"]] as const).map(([key,label]) => <button key={key} className={savedStatusFilter === key ? "filter active" : "filter"} onClick={() => setSavedStatusFilter(key)}>{label}</button>)}</div><div className="question-grid">{filteredSavedQuestions.length ? filteredSavedQuestions.map((q) => <article className="question-card" key={q.id}><button className="card-open" onClick={() => setSelected(q)}><div className="card-meta">{q.category}<span className="card-arrow">↗</span></div><h3>{q.title}</h3><p>{q.body}</p></button><div className="card-foot"><span>{q.answers?.[0]?.count ?? 0}개의 생각</span><select className="saved-status" value={savedStatuses[q.id] ?? "to_answer"} onChange={(e) => void updateSavedStatus(q.id, e.target.value as SavedStatus)} aria-label="저장 질문 상태"><option value="to_answer">답변 전</option><option value="answered">답변 완료</option><option value="revisit">다시 생각하기</option></select><button className="save-question saved" onClick={() => void toggleSaved(q)}>저장 해제</button></div></article>) : <div className="empty-state"><h3>{savedQuestions.length ? "이 상태에 해당하는 질문이 없어요" : "아직 저장한 질문이 없어요"}</h3><p>탐색하다 마음에 남는 질문을 저장해 보세요.</p></div>}</div></>}
      {journalTab === "questions" && <div className="journal-list">{myQuestions.length ? myQuestions.map((q) => <article key={q.id} className="journal-row"><button className="journal-open" onClick={() => !q.deleted_at && setSelected(q)} disabled={!!q.deleted_at}><small>{q.category}</small><strong>{q.deleted_at ? "삭제된 질문" : q.title}</strong><span>{q.deleted_at ? "공개에서 숨김" : `${q.answers?.[0]?.count ?? 0}개의 답변`}</span></button>{!q.deleted_at && <label className="visibility"><input type="checkbox" checked={!!q.is_public} onChange={(e) => void setVisibility("questions", q.id, e.target.checked)} /><span>{q.is_public ? "공개" : "나만 보기"}</span></label>}{!q.deleted_at && <button className="report-link delete-link" onClick={() => void deleteQuestion(q)}>질문 삭제</button>}</article>) : <div className="empty-state"><h3>아직 작성한 질문이 없어요</h3><p>탐색 화면에서 첫 질문을 작성해 보세요.</p></div>}</div>}
      {journalTab === "answers" && <div className="journal-list">{myAnswers.length ? myAnswers.map((answer) => { const history = answerGroups[answer.question_id] ?? [answer]; const isLatest = history.reduce((latest, item) => new Date(item.created_at) > new Date(latest.created_at) ? item : latest).id === answer.id; return <article key={answer.id} className="journal-row answer-row"><div><small>{answer.questions?.category ?? "질문"} · {new Date(answer.created_at).toLocaleDateString("ko-KR")}</small><strong>{answer.questions?.title ?? "삭제된 질문"}</strong><p>{answer.body}</p>{isLatest && history.length > 1 && <button className="compare-button" onClick={() => compareAnswers(answer.questions?.title ?? "나의 질문", history)}>첫 답변과 최근 답변 비교 · {history.length}회 기록</button>}</div><label className="visibility"><input type="checkbox" checked={answer.is_public} onChange={(e) => void setVisibility("answers", answer.id, e.target.checked)} /><span>{answer.is_public ? "공개" : "나만 보기"}</span></label><button className="report-link delete-link" onClick={() => void deleteAnswer(answer)}>답변 삭제</button></article>; }) : <div className="empty-state"><h3>아직 남긴 답변이 없어요</h3><p>질문에 답하며 생각을 기록해 보세요.</p></div>}</div>}
      {journalTab === "blocked" && <div className="journal-list">{blockedUsers.length ? blockedUsers.map((blocked) => <article className="journal-row" key={blocked.id}><div><small>차단한 사용자</small><strong>{blocked.display_name}</strong><p className="block-reason">{blocked.reason ? `차단 이유: ${blocked.reason}` : "차단 이유를 기록하지 않았어요."}</p></div><button className="report-link" onClick={() => void unblockUser(blocked.id)}>차단 해제</button></article>) : <div className="empty-state"><h3>차단한 사용자가 없어요</h3><p>차단한 계정은 이 목록에서 다시 허용할 수 있어요.</p></div>}</div>}
      {journalTab === "profile" && <div className="profile-panel"><div className="profile-avatar">{(profile.display_name || user?.email || "W").slice(0,1).toUpperCase()}</div><div><div className="eyebrow muted">ACCOUNT SETTINGS</div><h3>{profile.display_name || "이름을 정해보세요"}</h3><p>{user?.email}</p><span className="profile-stat">질문 {myQuestions.length} · 답변 {myAnswers.length}</span></div><form onSubmit={saveProfile}><label>사용자 이름<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" value={accountUsername} onChange={(e) => setAccountUsername(e.target.value)} disabled={!profileEditing || !!accountUsername} readOnly={!!accountUsername} placeholder="영문, 숫자, 밑줄 3~24자" /></label><label>표시 이름<input name="display_name" required maxLength={50} value={profile.display_name} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} disabled={!profileEditing} placeholder="다른 사람에게 보여줄 이름" /></label><label>선호 번역 언어<select name="preferred_language" required value={profile.preferred_language} onChange={(e) => setProfile({ ...profile, preferred_language: e.target.value })} disabled={!profileEditing}>{languages.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label><label>나라 <span className="optional">선택</span><input name="country_code" list="profile-countries" maxLength={2} pattern="[A-Za-z]{2}" value={profile.country_code} onChange={(e) => setProfile({ ...profile, country_code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0,2) })} disabled={!profileEditing} placeholder="국가 코드 · 예: KR" /><datalist id="profile-countries"><option value="KR" label="대한민국"/><option value="US" label="미국"/><option value="JP" label="일본"/><option value="CN" label="중국"/><option value="GB" label="영국"/><option value="DE" label="독일"/><option value="FR" label="프랑스"/><option value="BR" label="브라질"/><option value="CA" label="캐나다"/><option value="AU" label="호주"/><option value="ID" label="인도네시아"/></datalist></label><label>소개<textarea name="bio" maxLength={240} rows={3} value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} disabled={!profileEditing} placeholder="나를 소개해 주세요" /></label><label className="visibility"><input name="is_public" type="checkbox" checked={profile.is_public} onChange={(e) => setProfile({ ...profile, is_public: e.target.checked })} disabled={!profileEditing} /><span>프로필을 공개합니다</span></label>{profileEditing ? <div className="profile-form-actions"><button className="submit-button" disabled={busy}>{busy ? "저장 중…" : onboardingRequired ? "설정 저장하고 시작하기" : "변경 내용 저장"}<span>↗</span></button>{!onboardingRequired && <button type="button" className="profile-cancel" onClick={() => { setProfile(savedProfile); setProfileEditing(false); setNotice(""); }}>취소</button>}</div> : <button type="button" className="submit-button" onClick={() => setProfileEditing(true)}>프로필 수정<span>↗</span></button>}{profileSavedNotice && <p className="notice">{profileSavedNotice}</p>}</form></div>}
      {notice && <p className="notice journal-notice">{notice}</p>}
    </section>}
    <footer><a className="brand" href="#top"><span className="brand-mark">w</span> wdyt<span className="brand-dot">.</span></a><span>WHAT DO YOU THINK? &nbsp;·&nbsp; THINK TOGETHER, GROW WITHIN.</span><a href="#top">위로 ↑</a></footer>

    {authOpen && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setAuthOpen(false); }}><section className="modal auth-modal"><button className="close" onClick={() => setAuthOpen(false)}>×</button><div className="eyebrow muted">YOUR SPACE FOR THOUGHT</div><h2>{authMode === "signup" ? "생각을 시작해볼까요?" : "다시 만나 반가워요."}</h2><p>{authMode === "signup" ? "사용자 이름과 이메일을 등록해 주세요." : "사용자 이름과 비밀번호로 로그인해 주세요."}</p>
      <form onSubmit={authenticate}>
        {authMode === "signup" && <label>사용자 이름<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="영문, 숫자, 밑줄 3~24자" /></label>}
        {authMode === "signup" ? <label>이메일<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label> : <label>사용자 이름<input name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" autoComplete="username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="사용자 이름" /></label>}
        <label>비밀번호<input name="password" type="password" minLength={authMode === "signup" ? 12 : 1} required autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder={authMode === "signup" ? "12자 이상" : "비밀번호"} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} /></label>
        {authMode === "login" && <label className="remember-username"><input type="checkbox" checked={rememberUsername} onChange={(e) => setRememberUsername(e.target.checked)} /><span>이 기기에 사용자 이름 저장 <small>(비밀번호는 저장하지 않아요)</small></span></label>}
        <button className="submit-button" disabled={busy}>{busy ? "잠시만요…" : authMode === "signup" ? "가입하고 계속하기" : "로그인하기"}<span>↗</span></button>
      </form>
      <div className="oauth-divider"><span>또는</span></div><div className="oauth-buttons"><button type="button" disabled={busy} onClick={() => void signInWithProvider("google")}>Google로 계속하기</button><button type="button" disabled={busy} onClick={() => void signInWithProvider("kakao")}>카카오로 계속하기</button></div>
      <button className="switch-auth" onClick={() => { setAuthPassword(""); setAuthMode(authMode === "signup" ? "login" : "signup"); setNotice(""); }}>{authMode === "signup" ? "이미 가입했나요? 로그인하기" : "처음 오셨나요? 회원가입"}</button>{notice && <p className="notice">{notice}</p>}</section></div>}
    {comparison && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setComparison(null); }}><section className="modal comparison-modal"><button className="close" onClick={() => setComparison(null)}>×</button><div className="eyebrow muted">THOUGHTS OVER TIME</div><h2>시간이 지난 뒤, 내 생각은 어떻게 달라졌을까요?</h2><p className="comparison-question">{comparison.title}</p><div className="comparison-grid"><article><time>처음 답한 날 · {new Date(comparison.older.created_at).toLocaleDateString("ko-KR")}</time><p>{comparison.older.body}</p><span>{comparison.older.is_public ? "공개 답변" : "나만 보는 답변"}</span></article><article><time>최근 답한 날 · {new Date(comparison.newer.created_at).toLocaleDateString("ko-KR")}</time><p>{comparison.newer.body}</p><span>{comparison.newer.is_public ? "공개 답변" : "나만 보는 답변"}</span></article></div><p className="reflection-prompt">읽어보며 달라진 점이나 그대로인 점을 찾아보세요. 변화가 없어도 괜찮아요.</p></section></div>}
    {selected && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}>
      <section className="modal question-modal">
        <button className="close" onClick={() => setSelected(null)}>×</button>
        <div className="eyebrow muted">{selected.category} · {languages.find(([code]) => code === selected.language)?.[1] ?? selected.language.toUpperCase()}{selected.country_code ? ` · ${selected.country_code}` : ""}</div>
        <h2>{currentQuestionTranslationShown && currentQuestionTranslation ? currentQuestionTranslation.title : selected.title}</h2>
        {(currentQuestionTranslationShown ? currentQuestionTranslation?.body : selected.body) && <p>{currentQuestionTranslationShown && currentQuestionTranslation ? currentQuestionTranslation.body : selected.body}</p>}
        {selected.is_public && <div className="content-actions">{user?.id !== selected.author_id && <button className="report-link" onClick={() => { setReportNotice(""); setReportTarget({ type: "question", id: selected.id, excerpt: `${selected.title}\n${selected.body}` }); }}>질문 신고</button>}{user && selected.author_id !== user.id && <button className="report-link" onClick={() => { setBlockTarget(selected.author_id); setBlockReason(""); }}>작성자 차단</button>}</div>}
        {selected.is_public && <><button className="translate-button question-translate" onClick={() => void translateQuestion()} disabled={translatingQuestion || selected.language.split("-")[0].toLowerCase() === profile.preferred_language}>{translatingQuestion ? "질문 번역 중…" : currentQuestionTranslationShown ? "원문 보기" : currentQuestionTranslation ? "번역 보기" : selected.language.split("-")[0].toLowerCase() === profile.preferred_language ? `이미 ${preferredLanguageLabel}로 작성된 질문` : `${preferredLanguageLabel}로 질문 번역`}</button><div className="translation-note">번역 시 공개 질문이 DeepL로 전송됩니다.</div></>}
        <div className="answer-list">{answers.map((answer) => {
          const target = translationTargets[profile.preferred_language] ?? "EN-US";
          const translated = translationByAnswer[answer.id] ?? answer.translations?.find((item) => item.target_language === target)?.translated_text;
          const showTranslation = shownTranslations.has(answer.id) && !!translated;
          return <article key={answer.id}>
            <p>{showTranslation ? translated : answer.body}</p>
            <div className="answer-actions"><time>{new Date(answer.created_at).toLocaleDateString("ko-KR")}{!answer.is_public && <span className="private-tag"> · 나만 보기</span>}</time>{answer.is_public && selected.is_public && <button className="translate-button" onClick={() => void translateAnswer(answer)} disabled={translatingId === answer.id || answer.language.split("-")[0].toLowerCase() === profile.preferred_language}>{translatingId === answer.id ? "번역 중…" : showTranslation ? "원문 보기" : translated ? "번역 보기" : answer.language.split("-")[0].toLowerCase() === profile.preferred_language ? `이미 ${preferredLanguageLabel} 답변` : `${preferredLanguageLabel}로 번역`}</button>}</div>
            {answer.is_public && selected.is_public && <div className="translation-note">번역을 누르면 공개 답변이 DeepL로 전송되어 번역됩니다.</div>}
            {answer.is_public && selected.is_public && <div className="content-actions">{user?.id !== answer.author_id && <button className="report-link" onClick={() => { setReportNotice(""); setReportTarget({ type: "answer", id: answer.id, excerpt: answer.body }); }}>답변 신고</button>}{user && answer.author_id !== user.id && <button className="report-link" onClick={() => { setBlockTarget(answer.author_id); setBlockReason(""); }}>작성자 차단</button>}</div>}
            {answer.is_public && selected.is_public && <div className="reaction-row">{([ ["helpful","도움 돼요"], ["relate","공감해요"], ["perspective","새로운 관점"] ] as [ReactionKind,string][]).map(([kind,label]) => { const count = answer.answer_reactions?.filter((item) => item.reaction === kind).length ?? 0; const active = answer.answer_reactions?.some((item) => item.reaction === kind && item.user_id === user?.id) ?? false; const ownAnswer = answer.author_id === user?.id; return <button key={kind} disabled={ownAnswer || reactionBusy.has(`${answer.id}:${kind}`)} title={ownAnswer ? "내 답변에는 반응할 수 없어요" : undefined} className={active ? "reaction-chip active" : "reaction-chip"} onClick={() => void toggleReaction(answer, kind)}>{label}<span>{count}</span></button>; })}</div>}
            {answer.is_public && selected.is_public && user?.id === answer.author_id && <span className="reaction-owner-note">내 답변에는 반응할 수 없어요.</span>}
          </article>;
        })}{answers.length === 0 && <p className="quiet">아직 공개 답변이 없어요. 첫 생각을 남겨보세요.</p>}</div>
        {notice && <p className="notice">{notice}</p>}
        {selected.deleted_at ? <p className="deleted-note">이 질문은 삭제되어 공개 답변과 새 답변 작성이 숨겨졌어요.</p> : <form onSubmit={createAnswer}><label>당신의 생각<textarea name="body" required maxLength={5000} rows={4} placeholder="이 질문을 읽고 어떤 생각이 들었나요?" /></label><label className="visibility"><input name="is_public" type="checkbox" defaultChecked /><span>이 답변을 공개합니다</span></label><button className="submit-button" disabled={busy}>{busy ? "기록 중…" : "생각 남기기"}<span>↗</span></button></form>}
      </section>
    </div>}
    {blockTarget && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setBlockTarget(null); }}><section className="modal"><button className="close" onClick={() => setBlockTarget(null)}>×</button><div className="eyebrow muted">COMMUNITY SAFETY</div><h2>이 사용자를 차단할까요?</h2><p>차단한 이유를 적어두면 나중에 차단 목록에서 확인할 수 있어요.</p><form onSubmit={(e) => { e.preventDefault(); void blockUser(blockTarget, blockReason); }}><label>차단 이유 <span className="optional">선택</span><textarea value={blockReason} onChange={(e) => setBlockReason(e.target.value)} maxLength={500} rows={4} placeholder="예: 반복적인 괴롭힘, 원치 않는 연락" /></label><button className="submit-button">차단하고 이유 저장<span>↗</span></button></form></section></div>}
    {reportTarget && <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setReportTarget(null); }}><section className="modal"><button className="close" onClick={() => setReportTarget(null)}>×</button><div className="eyebrow muted">COMMUNITY SAFETY</div><h2>{reportTarget.type === "question" ? "질문 신고" : "답변 신고"}</h2><p>신고 내용은 검토를 위해 운영자에게 전달됩니다.</p><form onSubmit={submitReport}><label>신고 사유<select name="reason" required defaultValue="spam"><option value="spam">스팸 또는 광고</option><option value="harassment">괴롭힘 또는 위협</option><option value="hate">혐오 표현</option><option value="privacy">개인정보 노출</option><option value="dangerous">위험하거나 불법적인 내용</option><option value="other">기타</option></select></label><label>추가 설명 <span className="optional">선택</span><textarea name="details" maxLength={1000} rows={4} placeholder="검토에 필요한 내용을 적어주세요." /></label><button className="submit-button">신고 접수<span>↗</span></button></form>{reportNotice && <p className="notice">{reportNotice}</p>}</section></div>}
  </main>;
}
