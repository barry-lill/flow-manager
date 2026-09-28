import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!url || !publishableKey || !token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const client = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user } = await client.auth.getUser(token);
  if (!user.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await client.from("flow_modules").select("key,name,sort_order").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ modules: data || [] });
}
