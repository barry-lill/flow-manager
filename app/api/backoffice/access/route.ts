import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function isGukAdmin(email?: string | null) {
  const list = (process.env.FLOW_MANAGER_GUK_ADMIN_EMAILS || "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!url || !publishableKey || !token) return NextResponse.json({ allowed: false }, { status: 401 });
  const client = createClient(url, publishableKey);
  const { data } = await client.auth.getUser(token);
  return NextResponse.json({ allowed: isGukAdmin(data.user?.email), email: data.user?.email || "" });
}
