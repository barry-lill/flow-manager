import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function allowed(email?: string | null) {
  return !!email && (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).includes(email.toLowerCase());
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!url || !publishableKey || !secretKey) return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const client = createClient(url, publishableKey);
  const { data } = token ? await client.auth.getUser(token) : { data: { user: null } };
  if (!allowed(data.user?.email)) return NextResponse.json({ error: "GUK back office access required." }, { status: 403 });

  const { id } = await params;
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: customer, error } = await admin.from("organizations").select("id,name,created_at,organization_modules(module_key,enabled),data_sources(source_key,name,configured)").eq("id", id).single();
  if (error || !customer) return NextResponse.json({ error: error?.message || "Customer not found." }, { status: 404 });

  // Give configured GUK admins view-only access so they can preview the customer app.
  const gukEmails = (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (gukEmails.length) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const email of gukEmails) {
      const user = users?.users.find((u) => u.email?.toLowerCase() === email);
      if (user) {
        const { data: existingMembership } = await admin.from("memberships")
          .select("role")
          .eq("org_id", id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!existingMembership) {
          await admin.from("memberships").insert({ org_id: id, user_id: user.id, role: "guk_viewer" });
        }
      }
    }
  }

  const { data: memberships, error: membershipError } = await admin
    .from("memberships").select("user_id,role").eq("org_id", id);
  const users = memberships?.length
    ? await Promise.all(memberships.map(async (membership) => {
        const { data } = await admin.auth.admin.getUserById(membership.user_id);
        return { email: data.user?.email || "Unknown", role: membership.role };
      }))
    : [];
  if (membershipError) return NextResponse.json({ error: membershipError.message }, { status: 500 });

  return NextResponse.json({ customer, users });
}


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!url || !publishableKey || !secretKey) return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const client = createClient(url, publishableKey);
  const { data } = token ? await client.auth.getUser(token) : { data: { user: null } };
  if (!allowed(data.user?.email)) return NextResponse.json({ error: "GUK back office access required." }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const modules = Array.isArray(body.modules) ? body.modules.filter((x: unknown) => typeof x === "string") : [];
  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

  const { data: existing, error: existingError } = await admin.from("organizations").select("id").eq("id", id).single();
  if (existingError || !existing) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const { error: deleteError } = await admin.from("organization_modules").delete().eq("org_id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  if (modules.length) {
    const { error: insertError } = await admin.from("organization_modules").insert(
      modules.map((module_key: string) => ({ org_id: id, module_key, enabled: true }))
    );
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const { data: customer, error } = await admin.from("organizations")
    .select("id,name,created_at,organization_modules(module_key,enabled),data_sources(source_key,name,configured)")
    .eq("id", id).single();
  if (error || !customer) return NextResponse.json({ error: error?.message || "Could not reload customer." }, { status: 500 });
  return NextResponse.json({ customer });
}
