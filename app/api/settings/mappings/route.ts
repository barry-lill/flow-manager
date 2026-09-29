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

function isGukAdmin(email?: string | null) {
  return !!email && (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const orgId = request.nextUrl.searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "Organisation is required." }, { status: 400 });

  const admin = createClient(url!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken:false, persistSession:false } });
  const { data: membership } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (!membership && !isGukAdmin(user.email)) return NextResponse.json({ error: "You do not have access to this organisation." }, { status: 403 });

  const [{ data: sources, error: sourceError }, { data: mappings, error: mappingError }] = await Promise.all([
    admin.from("data_sources").select("source_key,name,description,configured,has_headers,header_row,data_start_row").eq("org_id", orgId),
    admin.from("data_mappings").select("source_key,field_key,source_column,required").eq("org_id", orgId),
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
  const hasHeaders = body.hasHeaders !== false;
  const headerRow = Math.max(1, Number(body.headerRow || 1));
  const dataStartRow = Math.max(1, Number(body.dataStartRow || 2));
  if (!orgId || !sourceKey) return NextResponse.json({ error: "Organisation and source are required." }, { status: 400 });

  const admin = createClient(url!, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken:false, persistSession:false } });
  const { data: membership } = await admin.from("memberships").select("role").eq("org_id", orgId).eq("user_id", user.id).maybeSingle();
  if (membership?.role !== "admin" && !isGukAdmin(user.email)) return NextResponse.json({ error: "Only the customer administrator can change field mappings." }, { status: 403 });

  const clean = mappings.filter((m: any) => typeof m.fieldKey === "string" && typeof m.sourceColumn === "string");
  const { error: deleteError } = await admin.from("data_mappings").delete().eq("org_id", orgId).eq("source_key", sourceKey);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  if (clean.length) {
    const { error } = await admin.from("data_mappings").insert(clean.map((m: any) => ({
      org_id: orgId, source_key: sourceKey, field_key: m.fieldKey, source_column: m.sourceColumn, required: !!m.required
    })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const sourcePayload = {
    org_id: orgId,
    source_key: sourceKey,
    name: sourceKey === "stock" ? "Stock data" : "Purchase orders",
    configured: true,
    has_headers: hasHeaders,
    header_row: headerRow,
    data_start_row: dataStartRow,
  };
  const { data: existingSource, error: sourceLookupError } = await admin
    .from("data_sources")
    .select("org_id,source_key")
    .eq("org_id", orgId)
    .eq("source_key", sourceKey)
    .maybeSingle();
  if (sourceLookupError) return NextResponse.json({ error: sourceLookupError.message }, { status: 500 });

  const { error: sourceError } = existingSource
    ? await admin.from("data_sources").update(sourcePayload).eq("org_id", orgId).eq("source_key", sourceKey)
    : await admin.from("data_sources").insert(sourcePayload);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  return NextResponse.json({ ok:true });
}
