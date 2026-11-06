"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

type ReportStatus = "pending" | "reviewed" | "dismissed" | "actioned";
type Report = {
  id: string;
  reporter_id: string;
  target_type: "question" | "answer";
  target_id: string;
  content_excerpt: string;
  reason: string;
  details: string;
  status: ReportStatus;
  created_at: string;
  reviewed_at: string | null;
};

const statusLabels: Record<ReportStatus, string> = { pending: "검토 대기", reviewed: "검토 완료", dismissed: "기각", actioned: "조치 완료" };
const reasonLabels: Record<string, string> = { spam: "스팸 또는 광고", harassment: "괴롭힘 또는 위협", hate: "혐오 표현", privacy: "개인정보 노출", dangerous: "위험하거나 불법적인 내용", other: "기타" };

export default function ModerationPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [access, setAccess] = useState<"loading" | "allowed" | "signed_out" | "denied" | "error">("loading");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const supabase = getSupabase();

  const loadReports = useCallback(async () => {
    if (!supabase) { setAccess("error"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAccess("signed_out"); return; }
    const response = await fetch("/api/moderation", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    if (response.status === 401) { setAccess("signed_out"); return; }
    if (response.status === 403) { setAccess("denied"); return; }
    if (!response.ok) { setAccess("error"); return; }
    const result = await response.json() as { reports: Report[] };
    setReports(result.reports ?? []);
    setAccess("allowed");
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReports(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  async function updateStatus(reportId: string, status: Exclude<ReportStatus, "pending">) {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAccess("signed_out"); return; }
    setBusyId(reportId); setNotice("");
    const response = await fetch("/api/moderation", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, status }),
    });
    setBusyId("");
    if (!response.ok) { setNotice("신고 상태를 저장하지 못했어요. 다시 시도해 주세요."); return; }
    const result = await response.json() as { report: { status: ReportStatus; reviewed_at: string } };
    setReports((items) => items.map((item) => item.id === reportId ? { ...item, status: result.report.status, reviewed_at: result.report.reviewed_at } : item));
    setNotice("검토 결과를 저장했어요.");
  }

  return <main className="moderation-page">
    <header className="moderation-header"><Link className="brand" href="/"><span className="brand-mark">w</span> wdyt<span className="brand-dot">.</span></Link><Link className="moderation-back" href="/">서비스로 돌아가기 ↗</Link></header>
    <section className="moderation-content">
      <div className="eyebrow muted">COMMUNITY CARE</div>
      <h1>신고 검토</h1>
      <p className="moderation-intro">신고된 공개 콘텐츠와 신고 사유를 확인하고 검토 상태를 기록합니다.</p>
      {access === "loading" && <div className="moderation-empty">신고 목록을 확인하고 있어요…</div>}
      {access === "signed_out" && <div className="moderation-empty"><h2>로그인이 필요해요</h2><p>운영자 계정으로 로그인한 뒤 다시 열어주세요.</p><Link href="/">WDYT로 돌아가기</Link></div>}
      {access === "denied" && <div className="moderation-empty"><h2>운영자 권한이 필요해요</h2><p>허용된 운영자 계정만 신고 내용을 확인할 수 있습니다.</p><Link href="/">WDYT로 돌아가기</Link></div>}
      {access === "error" && <div className="moderation-empty"><h2>신고 목록을 불러오지 못했어요</h2><p>서버 설정을 확인하고 다시 시도해 주세요.</p><button onClick={() => void loadReports()}>다시 불러오기</button></div>}
      {access === "allowed" && <>
        <div className="moderation-summary"><span>검토 대기 우선 · 최대 200건</span><strong>검토 대기 {reports.filter((item) => item.status === "pending").length}건</strong></div>
        {reports.length === 0 ? <div className="moderation-empty"><h2>접수된 신고가 없어요</h2><p>새 신고가 접수되면 이곳에서 확인할 수 있습니다.</p></div> : <div className="report-list">{reports.map((report) => <article className="report-card" key={report.id}>
          <div className="report-card-head"><div><span className="report-kind">{report.target_type === "question" ? "질문 신고" : "답변 신고"}</span><span className="report-reason">{reasonLabels[report.reason] ?? report.reason}</span></div><span className={`report-status status-${report.status}`}>{statusLabels[report.status]}</span></div>
          <blockquote>{report.content_excerpt || "신고 시 저장된 내용이 없습니다."}</blockquote>
          {report.details && <p className="report-details">신고 설명: {report.details}</p>}
          <div className="report-meta"><span>접수 {new Date(report.created_at).toLocaleString("ko-KR")}</span><span>신고자 ID {report.reporter_id.slice(0, 8)}…</span><span>콘텐츠 ID {report.target_id.slice(0, 8)}…</span></div>
          {report.status === "pending" && <div className="report-actions"><button disabled={busyId === report.id} onClick={() => void updateStatus(report.id, "reviewed")}>검토 완료</button><button disabled={busyId === report.id} onClick={() => void updateStatus(report.id, "dismissed")}>신고 기각</button><button disabled={busyId === report.id} onClick={() => void updateStatus(report.id, "actioned")}>조치 완료로 기록</button></div>}
        </article>)}</div>}
        <p className="moderation-footnote">이 화면은 신고 검토 상태를 기록합니다. 콘텐츠 삭제나 계정 제한은 자동으로 실행되지 않습니다.</p>
      </>}
      {notice && <p className="notice">{notice}</p>}
    </section>
  </main>;
}
