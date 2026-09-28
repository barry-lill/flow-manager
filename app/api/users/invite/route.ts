import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

export async function POST(request: NextRequest) {
  if (!url || !publishableKey || !secretKey) return NextResponse.json({ error: "Server authentication is not configured." }, { status: 500 });
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const client = createClient(url, publishableKey);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  const body = await request.json();
  const orgId = String(body.orgId || "");
  const email = String(body.email || "").trim().toLowerCase();
  const role = body.role === "admin" || body.role === "manager" || body.role === "viewer" ? body.role : "";
  if (!orgId || !email || !role) return NextResponse.json({ error: "Organisation, email and access level are required." }, { status: 400 });
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: membership, error: membershipError } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userData.user.id).maybeSingle();
  if (membershipError || membership?.role !== "admin") return NextResponse.json({ error: "Only an organisation admin can invite users." }, { status: 403 });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${siteUrl}/auth/invite` });
  if (inviteError || !invited.user) return NextResponse.json({ error: inviteError?.message || "Could not send invitation." }, { status: 400 });
  const { error: insertError } = await admin.from("memberships").upsert({ org_id: orgId, user_id: invited.user.id, role }, { onConflict: "org_id,user_id" });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const { data: orgModules } = await admin.from("organization_modules").select("module_key").eq("org_id", orgId).eq("enabled", true);
  if (orgModules?.length) await admin.from("membership_modules").upsert(orgModules.map((m) => ({ org_id: orgId, user_id: invited.user!.id, module_key: m.module_key, enabled: true })), { onConflict: "org_id,user_id,module_key" });
  return NextResponse.json({ ok: true });
}
