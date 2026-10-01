"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Stock = { stockCode: string; description: string; quantity: number; targetLevel: number; stockGroup: string };
type PurchaseOrder = { poNumber: string; stockCode: string; description: string; supplier: string; orderDate: string; dueDate: string; quantityOutstanding: number; workflowType: "PTA" | "PTO" };
type Membership = { orgId: string; orgName: string; role: "admin" | "manager" | "viewer" | "guk_viewer" | "guk_admin" };
type Mapping = Record<string, string>;
type View = "home" | "stock" | "purchases";
type StockSortKey = "stockCode" | "description" | "stockGroup" | "quantity" | "targetLevel" | "percentage";
type StockFilters = { stockCode: string; description: string; stockGroup: string; minQuantity: string; maxQuantity: string; minTarget: string; maxTarget: string; minPercentage: string; maxPercentage: string };

function formatImportTime(value: string | null | undefined) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
const goldrattLogo = "data:image/jpeg;base64,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";

function first(row: Record<string, unknown>, names: string[]) {
  const key = Object.keys(row).find((k) => names.includes(k.trim()));
  return key ? row[key] : undefined;
}
function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function columnLetter(index:number){let n=index+1,s="";while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}
function readImportRows(sheet:XLSX.WorkSheet, settings:any):Record<string,unknown>[] {
  const matrix=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",range:0});
  const start=Math.max(1,Number(settings.data_start_row||2))-1;
  const headerIndex=Math.max(0,Number(settings.header_row||1))-1;
  const width=Math.max(...matrix.map((r:any[])=>r.length),0);
  const headers=settings.has_headers===false ? Array.from({length:width},(_,i)=>columnLetter(i)) : ((matrix[headerIndex] as unknown[])||[]).map(v=>String(v).trim());
  return matrix.slice(start).map((row:any[])=>Object.fromEntries(headers.map((h:string,i:number)=>[h,row[i] ?? ""])));
}
function parseDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function bufferStatus(pct: number) {
  if (!Number.isFinite(pct)) return "blue";
  if (pct >= 100) return "blue";
  if (pct >= 66) return "green";
  if (pct >= 33) return "orange";
  if (pct > 0) return "red";
  return "black";
}

function daysBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const a = new Date(start + "T00:00:00").getTime();
  const b = new Date(end + "T00:00:00").getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

function formatUKDate(value: string) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function StockColumnMenu({ label, type, value, onValueChange, sort, onSort, options }: {
  label: string; type: "text" | "number" | "select"; value: string;
  onValueChange: (value: string) => void; sort: "asc" | "desc" | null;
  onSort: (direction: "asc" | "desc") => void; options?: string[];
}) {
  return <div className="column-filter-menu">
    <strong>{label}</strong>
    <button onClick={() => onSort("asc")}>Sort ascending {sort === "asc" ? "✓" : ""}</button>
    <button onClick={() => onSort("desc")}>Sort descending {sort === "desc" ? "✓" : ""}</button>
    <div className="filter-divider" />
    {type === "select" ? <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">(All)</option>{(options || []).map(option => <option key={option} value={option}>{option}</option>)}
    </select> : type === "number" ? <div className="filter-number-row">
      <input placeholder="Min" value={value.split("|")[0] || ""} onChange={(e) => onValueChange(e.target.value + "|" + (value.split("|")[1] || ""))} />
      <input placeholder="Max" value={value.split("|")[1] || ""} onChange={(e) => onValueChange((value.split("|")[0] || "") + "|" + e.target.value)} />
    </div> : <input placeholder="Contains..." value={value} onChange={(e) => onValueChange(e.target.value)} />}
  </div>;
}

function PurchaseOrdersSection({ orders, stocks }: {
  orders: PurchaseOrder[];
  stocks: Stock[];
}) {
  const stockByCode = useMemo(() => new Map(stocks.map(stock => [stock.stockCode, stock])), [stocks]);

  const rows = useMemo(() => {
    // A PO for a stock item with no target quantity is treated as PTO.
    const relevant = orders.filter(order => order.stockCode.trim() !== "" && stockByCode.has(order.stockCode));

    const grouped = new Map<string, PurchaseOrder[]>();
    for (const order of relevant) {
      if (!grouped.has(order.stockCode)) grouped.set(order.stockCode, []);
      grouped.get(order.stockCode)!.push(order);
    }

    const output: Array<PurchaseOrder & { projectedPct: number; status: string }> = [];
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    for (const [stockCode, stockOrders] of grouped) {
      const stock = stockByCode.get(stockCode);
      let projected = stock?.quantity ?? 0;
      const target = stock?.targetLevel ?? 0;

      const sortedOrders = [...stockOrders].sort((a, b) =>
        (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") ||
        (a.orderDate || "9999-12-31").localeCompare(b.orderDate || "9999-12-31")
      );

      for (const order of sortedOrders) {
        if (target <= 0) {
          let pct = 100;
          let status = "nodate";
          if (order.dueDate) {
            const totalDays = daysBetween(order.orderDate, order.dueDate);
            const elapsedDays = daysBetween(order.orderDate, todayKey);
            pct = totalDays > 0
              ? 100 - (elapsedDays / totalDays) * 100
              : todayKey < order.dueDate ? 100 : 0;
            status = bufferStatus(pct);
          }

          output.push({ ...order, workflowType: "PTO", projectedPct: pct, status });
        } else {
          const pct = (projected / target) * 100;
          output.push({ ...order, workflowType: "PTA", projectedPct: pct, status: bufferStatus(pct) });
          projected += order.quantityOutstanding;
        }
      }
    }

    return output.sort((a, b) => {
      const aPct = Number.isFinite(a.projectedPct) ? a.projectedPct : Infinity;
      const bPct = Number.isFinite(b.projectedPct) ? b.projectedPct : Infinity;
      return aPct - bPct ||
        a.supplier.localeCompare(b.supplier) ||
        a.stockCode.localeCompare(b.stockCode) ||
        a.poNumber.localeCompare(b.poNumber);
    });
  }, [orders, stockByCode]);

  return <section className="card" id="purchase-orders">
    <div className="section-heading">
      <div>
        <h3>Purchase Orders</h3>
        <p>PTA is buffer managed. POs for stock with no target are treated as PTO and time-managed from order date to due date.</p>
      </div>
    </div>
    <div className="table-wrap"><table className="po-table"><thead><tr>
      <th>PO</th><th>PTA/PTO</th><th>Stock code</th><th>Description</th><th>Supplier</th><th>Order date</th><th>Due date</th><th>Outstanding</th><th>Buffer / time %</th>
    </tr></thead><tbody>
      {rows.map((order, index) => <tr key={order.poNumber + "|" + order.stockCode + "|" + order.dueDate + "|" + index}>
        <td>{order.poNumber}</td>
        <td>{order.workflowType}</td>
        <td>{order.stockCode}</td>
        <td>{order.description}</td>
        <td>{order.supplier}</td>
        <td>{formatUKDate(order.orderDate)}</td>
        <td>{formatUKDate(order.dueDate)}</td>
        <td>{order.quantityOutstanding}</td>
        <td><span className={`po-status ${order.status}`}>{Math.round(order.projectedPct)}%</span></td>
      </tr>)}
      {!rows.length && <tr><td colSpan={9} className="empty">No purchase orders with a stock reference were found.</td></tr>}
    </tbody></table></div>
  </section>;
}
export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [gukCheckComplete, setGukCheckComplete] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [membership, setMembership] = useState<Membership | null>(null);
  const [membershipReady, setMembershipReady] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  
  const [visibleRowCount, setVisibleRowCount] = useState(100);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [message, setMessage] = useState("Loading Flow Manager...");
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "viewer">("manager");
  const [inviteMessage, setInviteMessage] = useState("");
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [mappingSettings, setMappingSettings] = useState<Record<string, any>>({});
  const [mappingsReady, setMappingsReady] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [isGukAdmin, setIsGukAdmin] = useState(false);
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "home";
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "stock" || requested === "purchases" ? requested : "home";
  });
  const [lastImports, setLastImports] = useState<{ stock: string | null; purchase_orders: string | null }>({ stock: null, purchase_orders: null });
  const [activeStockFilter, setActiveStockFilter] = useState<string | null>(null);
  const [stockFilters, setStockFilters] = useState<StockFilters>({ stockCode: "", description: "", stockGroup: "", minQuantity: "", maxQuantity: "", minTarget: "", maxTarget: "", minPercentage: "", maxPercentage: "" });
  const [stockSort, setStockSort] = useState<{ key: StockSortKey; direction: "asc" | "desc" }>({ key: "percentage", direction: "asc" });
  const scrollRestored = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true); });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    checkGukBackOffice();
  }, [session]);

  async function checkGukBackOffice() {
    const token = session?.access_token;
    if (!token) {
      setGukCheckComplete(true);
      return loadMembership();
    }
    const response = await fetch("/api/backoffice/access", {
      headers: { Authorization: "Bearer " + token },
    });
    if (response.ok) {
      const result = await response.json();
      const previewMode = new URLSearchParams(window.location.search).get("preview") === "1";
      setIsGukAdmin(!!result.allowed);
      if (result.allowed && !previewMode) {
        window.location.href = "/backoffice";
        return;
      }
    }
    setGukCheckComplete(true);
    loadMembership();
  }

  async function loadMembership() {
    setMembershipReady(false);
    const previewOrg = new URLSearchParams(window.location.search).get("customer");
    let query = supabase
      .from("memberships")
      .select("org_id, role, organizations(name)")
      .eq("user_id", session?.user.id);
    if (previewOrg) query = query.eq("org_id", previewOrg);
    const { data, error } = await query.maybeSingle();

    if (error) { setMessage(error.message); setMembershipReady(true); return; }
    if (!data) { setMembership(null); setMembershipReady(true); return; }

    const org = Array.isArray(data.organizations) ? data.organizations[0] : data.organizations;
    const next = { orgId: data.org_id, orgName: org?.name ?? "", role: data.role as Membership["role"] };
    setMembership(next);
    setMembershipReady(true);
    await loadModules(next.orgId);
    await loadMappings(next.orgId);
    loadData(next.orgId);
  }

  async function loadModules(orgId: string) {
    const { data, error } = await supabase
      .from("organization_modules")
      .select("module_key")
      .eq("org_id", orgId)
      .eq("enabled", true);
    if (!error) setEnabledModules((data || []).map((row) => row.module_key));
  }

  async function loadMappings(orgId: string) {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (!token) return;
    const response = await fetch("/api/settings/mappings?orgId=" + orgId, {
      headers: { Authorization: "Bearer " + token },
    });
    if (!response.ok) return;
    const result = await response.json();
    const grouped: Record<string, Mapping> = {};
    for (const row of result.mappings ?? []) {
      if (!grouped[row.source_key]) grouped[row.source_key] = {};
      grouped[row.source_key][row.field_key] = row.source_column;
    }
    const settings: Record<string, any> = {};
    for (const row of result.sources ?? []) {
      settings[row.source_key] = {
        has_headers: row.has_headers,
        header_row: row.header_row,
        data_start_row: row.data_start_row,
        last_imported_at: row.last_imported_at ?? null,
      };
    }
    setMappings(grouped);
    setMappingSettings(settings);
    setLastImports({ stock: settings.stock?.last_imported_at ?? null, purchase_orders: settings.purchase_orders?.last_imported_at ?? null });
    setMappingsReady(true);
  }

  async function loadData(orgId: string) {
    const stockRows: any[] = [];
    let stockError: any = null;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("stock")
        .select("stock_code,description,quantity,target_level,stock_group")
        .eq("org_id", orgId)
        .order("stock_code")
        .range(from, from + 999);
      if (error) { stockError = error; break; }
      stockRows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const { data: orderData, error: orderError } = await supabase
      .from("purchase_orders")
      .select("po_number,stock_code,description,supplier,order_date,due_date,quantity_outstanding,workflow_type")
      .eq("org_id", orgId)
      .order("due_date");

    if (stockError || orderError) { setMessage(stockError?.message || orderError?.message || "Could not load data."); return; }

    const mappedStocks = stockRows.map((s) => ({ stockCode: s.stock_code, description: s.description, quantity: Number(s.quantity), targetLevel: Number(s.target_level), stockGroup: s.stock_group }));
    const mappedOrders: PurchaseOrder[] = (orderData ?? []).map((p) => ({
      poNumber: p.po_number,
      stockCode: p.stock_code,
      description: p.description,
      supplier: p.supplier,
      orderDate: p.order_date ?? "",
      dueDate: p.due_date ?? "",
      quantityOutstanding: Number(p.quantity_outstanding),
      workflowType: p.workflow_type === "PTO" ? "PTO" : "PTA",
    }));
    setStocks(mappedStocks);
    setOrders(mappedOrders);
    setGroups([...new Set(mappedStocks.map((s) => s.stockGroup).filter(Boolean))].sort());
    setMessage(mappedStocks.length ? `Loaded ${mappedStocks.length.toLocaleString()} products and ${mappedOrders.length.toLocaleString()} PO lines.` : "No stock data yet. Import the Sage exports when ready.");
  }

  useEffect(() => {
    const onPopState = () => {
      const requested = new URLSearchParams(window.location.search).get("view");
      setView(requested === "stock" || requested === "purchases" ? requested : "home");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigateView(next: View) {
    const url = next === "home" ? "/" : "/?view=" + next;
    window.history.pushState({}, "", url);
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveStockFilter(null);
  }

  async function signIn() {
    setAuthMessage("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthMessage(error ? error.message : "");
  }

  async function createInitialOrganisation() {
    if (!orgName.trim()) return;
    setAuthMessage("Creating organisation...");
    const { error } = await supabase.rpc("create_initial_organization", { org_name: orgName.trim() });
    if (error) { setAuthMessage(error.message); return; }
    setOrgName("");
    setAuthMessage("");
    await loadMembership();
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function inviteUser() {
    if (!membership || membership.role !== "admin" || !inviteEmail.trim()) return;
    setInviteMessage("Sending invitation...");
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (!token) { setInviteMessage("Your session has expired. Please sign in again."); return; }

    const response = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orgId: membership.orgId, email: inviteEmail.trim(), role: inviteRole }),
    });
    const result = await response.json();
    setInviteMessage(response.ok ? `Invitation sent to ${inviteEmail.trim()}.` : (result.error || "Could not send invitation."));
    if (response.ok) setInviteEmail("");
  }

  async function importProducts(file: File) {
    if (!membership || (membership.role !== "admin" && membership.role !== "manager" && membership.role !== "guk_admin")) return;
    if (!mappingsReady || !mappings.stock) {
      setMessage("Stock import is not configured. An administrator must complete Settings → Stock data first.");
      return;
    }
    setMessage(`Uploading ${file.name}...`);
    try {
      const data = await file.arrayBuffer();
      const form = new FormData();
      form.append("file", new Blob([data]), file.name);
      form.append("orgId", membership.orgId);
      const auth = await supabase.auth.getSession();
      const token = auth.data.session?.access_token;
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch("/api/import/stock", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Stock import failed.");
      setLastImports((current) => ({ ...current, stock: new Date().toISOString() }));
      setLastImports((current) => ({ ...current, purchase_orders: new Date().toISOString() }));
      await loadData(membership.orgId);
      setMessage(result.message || `Imported and saved ${result.imported ?? 0} active products from ${file.name}.`);
    } catch (error) {
      setMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function importPurchaseOrders(file: File) {
    if (!membership || (membership.role !== "admin" && membership.role !== "manager" && membership.role !== "guk_admin")) return;
    if (!mappingsReady || !mappings.purchase_orders) {
      setMessage("Purchase order import is not configured. An administrator must complete Settings → Purchase orders first.");
      return;
    }
    const required = ["po_number", "due_date", "stock_code", "quantity"];
    if (required.some((key) => !mappings.purchase_orders[key])) {
      setMessage("Purchase order mapping is incomplete. An administrator must map all required fields in Settings.");
      return;
    }

    setMessage(`Uploading ${file.name}...`);
    try {
      const data = await file.arrayBuffer();
      const form = new FormData();
      form.append("file", new Blob([data]), file.name);
      form.append("orgId", membership.orgId);

      const auth = await supabase.auth.getSession();
      const token = auth.data.session?.access_token;
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const response = await fetch("/api/import/purchase-orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Purchase order import failed.");

      await loadData(membership.orgId);
      setMessage(result.message || `Imported and saved ${result.imported ?? 0} open/part-delivered PO lines from ${file.name}.`);
    } catch (error) {
      setMessage(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  const hasModule = (key: string) => enabledModules.includes(key);

  useEffect(() => { setVisibleRowCount(100); }, [stocks]);

  const visibleStocks = useMemo(() => stocks
    .filter((s) => {
      if (!(s.targetLevel > 0 || s.quantity > 0)) return false;
      const f = stockFilters;
      const pct = s.targetLevel > 0 ? (s.quantity / s.targetLevel) * 100 : s.quantity > 0 ? Infinity : 0;
      if (f.stockCode && !s.stockCode.toLowerCase().includes(f.stockCode.toLowerCase())) return false;
      if (f.description && !s.description.toLowerCase().includes(f.description.toLowerCase())) return false;
      if (f.stockGroup && s.stockGroup !== f.stockGroup) return false;
      const [minQ,maxQ] = [f.minQuantity,f.maxQuantity].map(Number);
      const [minT,maxT] = [f.minTarget,f.maxTarget].map(Number);
      const [minP,maxP] = [f.minPercentage,f.maxPercentage].map(Number);
      if (f.minQuantity && s.quantity < minQ) return false;
      if (f.maxQuantity && s.quantity > maxQ) return false;
      if (f.minTarget && s.targetLevel < minT) return false;
      if (f.maxTarget && s.targetLevel > maxT) return false;
      if (f.minPercentage && pct < minP) return false;
      if (f.maxPercentage && pct > maxP) return false;
      return true;
    })
    .sort((a, b) => {
      const pct = (s: Stock) => s.targetLevel > 0 ? (s.quantity / s.targetLevel) * 100 : s.quantity > 0 ? Infinity : 0;
      let result = 0;
      if (stockSort.key === "percentage") result = pct(a) - pct(b);
      else if (stockSort.key === "quantity") result = a.quantity - b.quantity;
      else if (stockSort.key === "targetLevel") result = a.targetLevel - b.targetLevel;
      else if (stockSort.key === "stockCode") result = a.stockCode.localeCompare(b.stockCode);
      else if (stockSort.key === "description") result = a.description.localeCompare(b.description);
      else result = a.stockGroup.localeCompare(b.stockGroup);
      return stockSort.direction === "asc" ? result : -result;
    }), [stocks, stockFilters, stockSort]);

  useEffect(() => {
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 500) {
        setVisibleRowCount(current => Math.min(current + 100, visibleStocks.length));
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, [visibleStocks.length]);

  if (!authReady) return <main><section className="hero"><h2>Flow Manager</h2><p>Connecting...</p></section></main>;

  if (!session) return (
    <main>
      <header className="topbar"><div><div className="eyebrow">FLOW MANAGER</div><h1>Flow, without the fuss.</h1></div><span className="version">v0.1</span></header>
      <section className="card auth">
        <h2>Sign in</h2><p>Flow Manager is invitation only. Your administrator will send you an invitation to create your account.</p>
        <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={signIn}>Sign in</button>
        <p className="footnote"><a href="/auth/forgot-password">Forgot your password?</a></p>
        {authMessage && <p className="footnote">{authMessage}</p>}
      </section>
    </main>
  );

  if (session && !gukCheckComplete) return <main><section className="hero"><h2>Flow Manager</h2><p>Checking account...</p></section></main>;

  if (!membershipReady) return <main><section className="hero"><h2>Flow Manager</h2><p>Loading customer...</p></section></main>;

  if (!membership) return (
    <main>
      <header className="topbar"><div><div className="eyebrow">FLOW MANAGER</div><h1>Initial setup</h1></div><button onClick={signOut}>Sign out</button></header>
      <section className="card auth">
        <h2>Create the first organisation</h2>
        <p>This one-time setup makes your current account the Flow Manager administrator.</p>
        <input placeholder="Organisation name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        <button onClick={createInitialOrganisation}>Create organisation</button>
        {authMessage && <p className="footnote">{authMessage}</p>}
      </section>
    </main>
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <img src={goldrattLogo} alt="Goldratt" className="brand-logo" />
          <div className="brand-copy"><div className="brand-title">FLOW MANAGER</div><div className="brand-tagline">Flow, without the fuss.</div></div>
        </div>
        <div className="header-right">
          <div className="customer-name">{membership.orgName}</div>
          <nav className="top-nav">
            <button className={view === "home" ? "nav-button active" : "nav-button"} onClick={() => navigateView("home")}>Home</button>
            {hasModule("stock") && <button className={view === "stock" ? "nav-button active" : "nav-button"} onClick={() => navigateView("stock")}>Stock</button>}
            {hasModule("purchase_orders") && <button className={view === "purchases" ? "nav-button active" : "nav-button"} onClick={() => navigateView("purchases")}>Purchases</button>}
            {(membership.role === "admin" || isGukAdmin) && <button className="nav-button" onClick={() => window.location.href=isGukAdmin ? "/settings?preview=1&customer=" + membership.orgId : "/settings"}>Settings</button>}
            {isGukAdmin && <button className="nav-button" onClick={() => window.location.href="/backoffice"}>Back Office</button>}
            <button className="nav-button" onClick={signOut}>Sign out</button>
          </nav>
        </div>
      </header>

      {view === "home" && <section className="home-page">
        <section className="hero home-hero">
          <h2>{membership.orgName}</h2><p>{message}</p>
          <div className="import-grid">
            {hasModule("stock") && <div className="import-card"><label className="upload"><span>Import Product Data</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) importProducts(file); e.currentTarget.value = ""; }} /></label><span className="last-import">Last import: {formatImportTime(lastImports.stock)}</span></div>}
            {hasModule("purchase_orders") && <div className="import-card"><label className="upload secondary"><span>Import Purchase Orders</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) importPurchaseOrders(file); e.currentTarget.value = ""; }} /></label><span className="last-import">Last import: {formatImportTime(lastImports.purchase_orders)}</span></div>}
          </div>
        </section>
        <section className="grid home-metrics">
          {hasModule("stock") && <button className="metric metric-link" onClick={() => navigateView("stock")}><span>Products</span><strong>{visibleStocks.length.toLocaleString()}</strong><small>View stock →</small></button>}
          {hasModule("purchase_orders") && <button className="metric metric-link" onClick={() => navigateView("purchases")}><span>PO lines</span><strong>{orders.length.toLocaleString()}</strong><small>View purchases →</small></button>}
        </section>
      </section>}

      {view === "stock" && hasModule("stock") && <section className="card">
        <div className="section-heading"><div><h2>Stock</h2><p>{visibleStocks.length.toLocaleString()} products shown</p></div><button onClick={() => { setStockFilters({ stockCode:"", description:"", stockGroup:"", minQuantity:"", maxQuantity:"", minTarget:"", maxTarget:"", minPercentage:"", maxPercentage:"" }); setStockSort({ key:"percentage", direction:"asc" }); setActiveStockFilter(null); }}>Clear filters & sort</button></div>
        <div className="table-wrap stock-table-wrap"><table className="stock-table"><thead><tr>
          {[
            ["Stock code","stockCode","text",stockFilters.stockCode],
            ["Description","description","text",stockFilters.description],
            ["Stock group","stockGroup","select",stockFilters.stockGroup],
            ["Stock","quantity","number",stockFilters.minQuantity + "|" + stockFilters.maxQuantity],
            ["Target","targetLevel","number",stockFilters.minTarget + "|" + stockFilters.maxTarget],
            ["Stock % of target","percentage","number",stockFilters.minPercentage + "|" + stockFilters.maxPercentage]
          ].map(([label,key,type,value]) => <th key={key} className="filterable-th">
            <button className={activeStockFilter === key ? "column-filter-button open" : "column-filter-button"} onClick={() => setActiveStockFilter(activeStockFilter === key ? null : key)}>{label}<span>▼</span></button>
            {activeStockFilter === key && <StockColumnMenu label={label} type={type as "text"|"number"|"select"} value={value} onValueChange={(next) => {
              setStockFilters(current => { const copy = { ...current }; if (key === "quantity") { const [min,max] = next.split("|"); copy.minQuantity=min; copy.maxQuantity=max; } else if (key === "targetLevel") { const [min,max] = next.split("|"); copy.minTarget=min; copy.maxTarget=max; } else if (key === "percentage") { const [min,max] = next.split("|"); copy.minPercentage=min; copy.maxPercentage=max; } else (copy as any)[key] = next; return copy; });
            }} sort={stockSort.key === key ? stockSort.direction : null} onSort={(direction) => { setStockSort({ key:key as StockSortKey, direction }); setActiveStockFilter(null); }} options={key === "stockGroup" ? groups : undefined} />}
          </th>)}
        </tr></thead><tbody>
          {visibleStocks.slice(0, visibleRowCount).map((stock) => {
            const pct = stock.targetLevel > 0 ? (stock.quantity / stock.targetLevel) * 100 : stock.quantity > 0 ? Infinity : 0;
            const status = pct === Infinity ? "blue" : pct >= 100 ? "blue" : pct >= 66 ? "green" : pct >= 33 ? "orange" : pct > 0 ? "red" : "black";
            const percentage = pct === Infinity ? "—" : Math.round(pct) + "%";
            return <tr key={stock.stockCode}><td>{stock.stockCode}</td><td>{stock.description}</td><td>{stock.stockGroup}</td><td>{stock.quantity}</td><td>{stock.targetLevel}</td><td><span className={"stock-percentage " + status}>{percentage}</span></td></tr>;
          })}
          {visibleStocks.length === 0 && <tr><td colSpan={6} className="empty">No products match the current filters.</td></tr>}
        </tbody></table></div>
        <p className="footnote">Showing {Math.min(visibleRowCount, visibleStocks.length).toLocaleString()} of {visibleStocks.length.toLocaleString()} matching products.</p>
      </section>}

      {view === "purchases" && hasModule("purchase_orders") && <PurchaseOrdersSection orders={orders} stocks={stocks} />}
    </main>
  );
}
