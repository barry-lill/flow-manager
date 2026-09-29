import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

async function getUser(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!url || !publishableKey || !token) return null;
  const client = createClient(url, publishableKey);
  const { data } = await client.auth.getUser(token);
  return data.user || null;
}

function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function columnLetter(index: number) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function readImportRows(sheet: XLSX.WorkSheet, settings: any) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    range: 0,
  });
  const start = Math.max(1, Number(settings.data_start_row || 2)) - 1;
  const headerIndex = Math.max(0, Number(settings.header_row || 1)) - 1;
  const width = Math.max(...matrix.map((r: any[]) => r.length), 0);
  const headers = settings.has_headers === false
    ? Array.from({ length: width }, (_, i) => columnLetter(i))
    : ((matrix[headerIndex] as unknown[]) || []).map((v) => String(v).trim());

  return matrix.slice(start).map((row: any[]) =>
    Object.fromEntries(headers.map((h: string, i: number) => [h, row[i] ?? ""]))
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser(request);
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!url || !secretKey) return NextResponse.json({ error: "Server database configuration is missing." }, { status: 500 });

    const form = await request.formData();
    const orgId = String(form.get("orgId") || "");
    const file = form.get("file");
    if (!orgId || !(file instanceof File)) {
      return NextResponse.json({ error: "Organisation and file are required." }, { status: 400 });
    }

    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError) throw new Error(membershipError.message);
    if (!membership || !["admin", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "You do not have permission to import stock data." }, { status: 403 });
    }

    const [{ data: source, error: sourceError }, { data: mappingRows, error: mappingError }] = await Promise.all([
      admin.from("data_sources")
        .select("has_headers,header_row,data_start_row")
        .eq("org_id", orgId)
        .eq("source_key", "stock")
        .maybeSingle(),
      admin.from("data_mappings")
        .select("field_key,source_column,required")
        .eq("org_id", orgId)
        .eq("source_key", "stock"),
    ]);

    if (sourceError) throw new Error(sourceError.message);
    if (mappingError) throw new Error(mappingError.message);
    if (!source) throw new Error("Stock import is not configured.");
    
    const mappings: Record<string, string> = {};
    for (const row of mappingRows || []) mappings[row.field_key] = row.source_column;

    const required = ["stock_code", "description", "quantity", "target_level"];
    const missing = required.filter((key) => !mappings[key]);
    if (missing.length) throw new Error(`Stock mapping is incomplete: ${missing.join(", ")}.`);

    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, { cellDates: true, dense: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("The workbook has no readable first worksheet.");

    const rows = readImportRows(sheet, source);
    const imported = rows
      .filter((row) => mappings.inactive_flag ? toNumber(row[mappings.inactive_flag]) !== 1 : true)
      .map((row) => ({
        org_id: orgId,
        stock_code: String(row[mappings.stock_code] ?? "").trim(),
        description: String(row[mappings.description] ?? ""),
        quantity: toNumber(row[mappings.quantity]),
        target_level: toNumber(row[mappings.target_level]),
        stock_group: mappings.stock_group ? String(row[mappings.stock_group] ?? "") : "",
      }))
      .filter((row) => row.stock_code);

    if (!imported.length) throw new Error("No active stock records could be read from the file. Check the file layout and mappings.");

    const uniqueCodes = new Set(imported.map((row) => row.stock_code));
    if (uniqueCodes.size !== imported.length) {
      throw new Error("The import contains duplicate stock codes. No existing stock was changed.");
    }

    const { error: deleteError } = await admin.from("stock").delete().eq("org_id", orgId);
    if (deleteError) throw new Error(`Could not replace existing stock: ${deleteError.message}`);

    const chunkSize = 500;
    for (let i = 0; i < imported.length; i += chunkSize) {
      const { error } = await admin.from("stock").insert(imported.slice(i, i + chunkSize));
      if (error) throw new Error(`Could not save stock data: ${error.message}`);
    }

    return NextResponse.json({
      ok: true,
      imported: imported.length,
      message: `Imported and saved ${imported.length.toLocaleString()} active products from ${file.name}.`,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
