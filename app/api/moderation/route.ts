import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const reportStatuses = ["reviewed", "dismissed", "actioned"] as const;
type ReportStatus = typeof reportStatuses[number];

function getConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const moderatorIds = (process.env.MODERATOR_USER_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  return { url, anonKey, serviceKey, moderatorIds };
}

async function getModerator(request: NextRequest) {
  const { url, anonKey, serviceKey, moderatorIds } = getConfiguration();
  if (!url || !anonKey || !serviceKey) return { error: NextResponse.json({ error: "moderation_not_configured" }, { status: 503 }) };
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: NextResponse.json({ error: "authentication_required" }, { status: 401 }) };

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "authentication_required" }, { status: 401 }) };
  if (!moderatorIds.includes(data.user.id)) return { error: NextResponse.json({ error: "moderator_access_required" }, { status: 403 }) };

  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { userId: data.user.id, adminClient };
}

export async function GET(request: NextRequest) {
  const access = await getModerator(request);
  if ("error" in access) return access.error;

  const columns = "id,reporter_id,target_type,target_id,content_excerpt,reason,details,status,created_at,reviewed_at,reviewed_by";
  const [pending, handled] = await Promise.all([
    access.adminClient.from("content_reports").select(columns).eq("status", "pending").order("created_at", { ascending: false }).limit(100),
    access.adminClient.from("content_reports").select(columns).neq("status", "pending").order("created_at", { ascending: false }).limit(100),
  ]);
  if (pending.error || handled.error) return NextResponse.json({ error: "reports_unavailable" }, { status: 500 });
  return NextResponse.json({ reports: [...(pending.data ?? []), ...(handled.data ?? [])] });
}

export async function PATCH(request: NextRequest) {
  const access = await getModerator(request);
  if ("error" in access) return access.error;

  let body: { reportId?: unknown; status?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const reportId = typeof body.reportId === "string" ? body.reportId : "";
  if (!/^[0-9a-f-]{36}$/i.test(reportId) || !reportStatuses.some((value) => value === body.status)) {
    return NextResponse.json({ error: "invalid_review_update" }, { status: 400 });
  }
  const status = body.status as ReportStatus;

  const { data, error } = await access.adminClient.from("content_reports")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: access.userId })
    .eq("id", reportId).select("id,status,reviewed_at,reviewed_by").maybeSingle();
  if (error) return NextResponse.json({ error: "review_update_failed" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  return NextResponse.json({ report: data });
}
