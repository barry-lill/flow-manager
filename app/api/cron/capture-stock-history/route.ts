import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function londonDateForSnapshot(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  const hour = Number(get("hour"));
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const date = new Date(Date.UTC(year, month - 1, day));
  // Vercel cron runs at 23:00 UTC. During BST this is 00:00 in London,
  // so the snapshot belongs to the previous calendar day.
  if (hour === 0) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!url || !secretKey) return NextResponse.json({ error: "Server configuration missing." }, { status: 500 });

  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const snapshotDate = londonDateForSnapshot();
    async function fetchAll<T>(table: string, columns: string) {
      const pageSize = 1000;
      const all: T[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await admin
          .from(table)
          .select(columns)
          .range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        const page = (data || []) as T[];
        all.push(...page);
        if (page.length < pageSize) break;
      }
      return all;
    }

    const stocks = await fetchAll<{
      org_id: string;
      stock_code: string;
      quantity: number;
      target_level: number;
    }>("stock", "org_id,stock_code,quantity,target_level");

    const orders = await fetchAll<{
      org_id: string;
      stock_code: string;
      quantity_outstanding: number;
      workflow_type: string;
    }>("purchase_orders", "org_id,stock_code,quantity_outstanding,workflow_type");

    const targetByStock = new Map<string, number>();
    for (const stock of stocks || []) {
      targetByStock.set(`${stock.org_id}|${stock.stock_code}`, Number(stock.target_level) || 0);
    }

    const incomingByStock = new Map<string, number>();
    for (const order of orders || []) {
      if (order.workflow_type !== "PTA") continue;
      const key = `${order.org_id}|${order.stock_code}`;
      if (!targetByStock.has(key)) continue;
      incomingByStock.set(key, (incomingByStock.get(key) || 0) + (Number(order.quantity_outstanding) || 0));
    }

    const rows = (stocks || []).map(stock => {
      const key = `${stock.org_id}|${stock.stock_code}`;
      const actual = Number(stock.quantity) || 0;
      const incoming = incomingByStock.get(key) || 0;
      return {
        org_id: stock.org_id,
        stock_code: stock.stock_code,
        snapshot_date: snapshotDate,
        actual_stock: actual,
        theoretical_stock: actual + incoming,
        target_stock: Number(stock.target_level) || 0,
        captured_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const { error } = await admin
          .from("stock_daily_history")
          .upsert(rows.slice(i, i + chunkSize), { onConflict: "org_id,stock_code,snapshot_date" });
        if (error) throw new Error(error.message);
      }
    }

    return NextResponse.json({ ok: true, snapshotDate, stocksCaptured: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
