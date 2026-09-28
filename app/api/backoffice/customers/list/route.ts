import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function allowed(email?: string | null) {
  const list = (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

async function getAdmin(request: NextRequest) {
  if (!url || !publishableKey || !secretKey) return null;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return null;
  const client = createClient(url, publishableKey);
  const { data } = await client.auth.getUser(token);
  if (!data.user || !allowed(data.user.email)) return null;
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export async function GET(request: NextRequest) {
  const admin = await getAdmin(request);
  if (!admin) return NextResponse.json({ error: "GUK back office access required." }, { status: 403 });

  const { data, error } = await admin
    .from("organizations")
    .select("id,name,created_at,organization_modules(module_key,enabled)")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data || [] });
}
