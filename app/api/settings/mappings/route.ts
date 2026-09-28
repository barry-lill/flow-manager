import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function getUser(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!url || !key || !token) return null;
  const client = createClient(url, key);
  const { data } = await client.auth.getUser(token);
  return data.user || null;
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "Organisation is required." }, { status: 400 });
  const client = createClient(url!, key!);
  const [{ data: sources, error: sourceError }, { data: mappings, error: mappingError }] = await Promise.all([
    client.from("data_sources").select("source_key,name,description,configured").eq("org_id", orgId),
    client.from("data_mappings").select("source_key,field_key,source_column,required").eq("org_id", orgId),
  ]);
  if (sourceError || mappingError) return NextResponse.json({ error: sourceError?.message || mappingError?.message }, { status: 500 });
  return NextResponse.json({ sources: sources || [], mappings: mappings || [] });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json();
  const orgId = String(body.orgId || "");
  const sourceKey = String(body.sourceKey || "");
  const mappings = Array.isArray(body.mappings) ? body.mappings : [];
  if (!orgId || !sourceKey) return NextResponse.json({ error: "Organisation and source are required." }, { status: 400 });

  const admin = createClient(url!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken:false, persistSession:false } });
  const { data: membership } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "admin") return NextResponse.json({ error: "Only the customer administrator can change field mappings." }, { status: 403 });

  const clean = mappings.filter((m: any) => typeof m.fieldKey === "string" && typeof m.sourceColumn === "string");
  await admin.from("data_mappings").delete().eq("org_id", orgId).eq("source_key", sourceKey);
  if (clean.length) {
    const { error } = await admin.from("data_mappings").insert(clean.map((m: any) => ({
      org_id: orgId, source_key: sourceKey, field_key: m.fieldKey, source_column: m.sourceColumn, required: !!m.required
    })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await admin.from("data_sources").upsert({ org_id: orgId, source_key: sourceKey, name: sourceKey === "stock" ? "Stock data" : "Purchase orders", configured: true }, { onConflict:"org_id,source_key" });
  return NextResponse.json({ ok:true });
}
