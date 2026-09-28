import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function allowed(email?: string | null) {
  const list = (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

async function auth(request: NextRequest) {
  if (!url || !publishableKey || !secretKey) throw new Error("Server authentication is not configured.");
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const client = createClient(url, publishableKey);
  const { data } = await client.auth.getUser(token);
  return data.user && allowed(data.user.email) ? data.user : null;
}

export async function POST(request: NextRequest) {
  try {
    const user = await auth(request);
    if (!user) return NextResponse.json({ error: "GUK back office access required." }, { status: 403 });
    const body = await request.json();
    const company = String(body.company || "").trim();
    const primaryEmail = String(body.primaryEmail || "").trim().toLowerCase();
    const modules = Array.isArray(body.modules) ? body.modules.filter((x: unknown) => typeof x === "string") : [];
    const gukEmail = String(body.gukEmail || "").trim().toLowerCase();
    if (!company || !primaryEmail) return NextResponse.json({ error: "Company and primary administrator email are required." }, { status: 400 });

    const admin = createClient(url!, secretKey!, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data: org, error: orgError } = await admin.from("organizations").insert({ name: company }).select("id,name").single();
    if (orgError || !org) return NextResponse.json({ error: orgError?.message || "Could not create customer." }, { status: 400 });

    if (modules.length) {
      const { error: moduleError } = await admin.from("organization_modules").insert(modules.map((module_key: string) => ({ org_id: org.id, module_key, enabled: true })));
      if (moduleError) {
        await admin.from("organizations").delete().eq("id", org.id);
        return NextResponse.json({ error: moduleError.message }, { status: 400 });
      }
    }
    const { error: sourceError } = await admin.from("data_sources").insert([
      { org_id: org.id, source_key: "stock", name: "Stock data" },
      { org_id: org.id, source_key: "purchase_orders", name: "Purchase orders" },
    ]);
    if (sourceError) {
      await admin.from("organizations").delete().eq("id", org.id);
      return NextResponse.json({ error: sourceError.message }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const { data: existingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = existingUsers?.users.find((u) => u.email?.toLowerCase() === primaryEmail) || null;
    let primaryUserId = existing?.id || "";
    let invitationSent = false;

    if (!primaryUserId) {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(primaryEmail, { redirectTo: `${siteUrl}/auth/invite` });
      if (inviteError || !invited.user) {
        await admin.from("organizations").delete().eq("id", org.id);
        return NextResponse.json({ error: inviteError?.message || "Primary administrator invitation failed." }, { status: 400 });
      }
      primaryUserId = invited.user.id;
      invitationSent = true;
    }

    const { error: membershipError } = await admin.from("memberships").insert({ org_id: org.id, user_id: primaryUserId, role: "admin" });
    if (membershipError) {
      await admin.from("organizations").delete().eq("id", org.id);
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }
    if (modules.length) await admin.from("membership_modules").insert(modules.map((module_key: string) => ({ org_id: org.id, user_id: primaryUserId, module_key, enabled: true })));

    if (gukEmail) {
      let gukUser: { id: string } | null = null;
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      gukUser = users?.users.find((u) => u.email?.toLowerCase() === gukEmail)?.id ? { id: users.users.find((u) => u.email?.toLowerCase() === gukEmail)!.id } : null;
      if (!gukUser) {
        const { data: gukInvite } = await admin.auth.admin.inviteUserByEmail(gukEmail, { redirectTo: `${siteUrl}/auth/invite` });
        if (gukInvite.user) gukUser = { id: gukInvite.user.id };
      }
      if (gukUser) await admin.from("memberships").upsert({ org_id: org.id, user_id: gukUser.id, role: "guk_viewer" }, { onConflict: "org_id,user_id" });
    }

    return NextResponse.json({ ok: true, organization: org, invitationSent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error." }, { status: 500 });
  }
}
