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
  return NextResponse.json({ customer });
}
