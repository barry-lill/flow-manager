"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Stock = { stockCode: string; description: string; quantity: number; targetLevel: number; stockGroup: string };
type PurchaseOrder = { poNumber: string; stockCode: string; description: string; supplier: string; orderDate: string; dueDate: string; quantityOutstanding: number };
type Membership = { orgId: string; orgName: string; role: "admin" | "manager" | "viewer" | "guk_viewer" };
type Mapping = Record<string, string>;

function first(row: Record<string, unknown>, names: string[]) {
  const key = Object.keys(row).find((k) => names.includes(k.trim()));
  return key ? row[key] : undefined;
}
function toNumber(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function columnLetter(index:number){let n=index+1,s="";while(n>0){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26);}return s;}\nfunction readImportRows(sheet:XLSX.WorkSheet, settings:any):Record<string,unknown>[] {\n  const matrix=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",range:0});\n  const start=Math.max(1,Number(settings.data_start_row||2))-1;\n  const headerIndex=Math.max(0,Number(settings.header_row||1))-1;\n  const width=Math.max(...matrix.map((r:any[])=>r.length),0);\n  const headers=settings.has_headers===false ? Array.from({length:width},(_,i)=>columnLetter(i)) : ((matrix[headerIndex] as unknown[])||[]).map(v=>String(v).trim());\n  return matrix.slice(start).map((row:any[])=>Object.fromEntries(headers.map((h:string,i:number)=>[h,row[i] ?? ""])));\n}\nfunction parseDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
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
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [message, setMessage] = useState("Loading Flow Manager...");
  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager" | "viewer">("manager");
  const [inviteMessage, setInviteMessage] = useState("");
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [mappingsReady, setMappingsReady] = useState(false);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [isGukAdmin, setIsGukAdmin] = useState(false);

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
    setMappings(grouped);
    setMappingsReady(true);
  }

  async function loadData(orgId: string) {
    const [{ data: stockData, error: stockError }, { data: orderData, error: orderError }] = await Promise.all([
      supabase.from("stock").select("stock_code,description,quantity,target_level,stock_group").eq("org_id", orgId).order("stock_code"),
      supabase.from("purchase_orders").select("po_number,stock_code,description,supplier,order_date,due_date,quantity_outstanding").eq("org_id", orgId).order("due_date"),
    ]);
    if (stockError || orderError) { setMessage(stockError?.message || orderError?.message || "Could not load data."); return; }

    const mappedStocks = (stockData ?? []).map((s) => ({ stockCode: s.stock_code, description: s.description, quantity: Number(s.quantity), targetLevel: Number(s.target_level), stockGroup: s.stock_group }));
    const mappedOrders = (orderData ?? []).map((p) => ({ poNumber: p.po_number, stockCode: p.stock_code, description: p.description, supplier: p.supplier, orderDate: p.order_date ?? "", dueDate: p.due_date ?? "", quantityOutstanding: Number(p.quantity_outstanding) }));
    setStocks(mappedStocks);
    setOrders(mappedOrders);
    setGroups([...new Set(mappedStocks.map((s) => s.stockGroup).filter(Boolean))].sort());
    setMessage(mappedStocks.length ? `Loaded ${mappedStocks.length.toLocaleString()} products and ${mappedOrders.length.toLocaleString()} PO lines.` : "No stock data yet. Import the Sage exports when ready.");
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
    if (!membership || (membership.role !== "admin" && membership.role !== "manager")) return;
    if (!mappingsReady || !mappings.stock) {
      setMessage("Stock import is not configured. An administrator must complete Settings → Stock data first.");
      return;
    }
    const required = ["stock_code", "description", "quantity", "target_level"];
    if (required.some((key) => !mappings.stock[key])) {
      setMessage("Stock mapping is incomplete. An administrator must map all required fields in Settings.");
      return;
    }
    setMessage("Importing products...");
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { cellDates: true });
    const settings = mappingSettings.stock || { has_headers:true, header_row:1, data_start_row:2 };\n    const rows = readImportRows(workbook.Sheets[workbook.SheetNames[0]], settings);
    const map = mappings.stock;
    const imported: Stock[] = rows
      .filter((row) => map.inactive_flag ? toNumber(row[map.inactive_flag]) !== 1 : true)
      .map((row) => ({
        stockCode: String(row[map.stock_code] ?? "").trim(),
        description: String(row[map.description] ?? ""),
        quantity: toNumber(row[map.quantity]),
        targetLevel: toNumber(row[map.target_level]),
        stockGroup: map.stock_group ? String(row[map.stock_group] ?? "") : "",
      })).filter((s) => s.stockCode);

    const { error: deleteError } = await supabase.from("stock").delete().eq("org_id", membership.orgId);
    if (deleteError) { setMessage(`Could not replace stock data: ${deleteError.message}`); return; }
    const { error } = await supabase.from("stock").insert(imported.map((s) => ({ org_id: membership.orgId, stock_code: s.stockCode, description: s.description, quantity: s.quantity, target_level: s.targetLevel, stock_group: s.stockGroup })));
    if (error) { setMessage(`Could not save stock data: ${error.message}`); return; }
    await loadData(membership.orgId);
    setMessage(`Imported and saved ${imported.length.toLocaleString()} active products from ${file.name}.`);
  }

  async function importPurchaseOrders(file: File) {
    if (!membership || (membership.role !== "admin" && membership.role !== "manager")) return;
    if (!mappingsReady || !mappings.purchase_orders) {
      setMessage("Purchase order import is not configured. An administrator must complete Settings → Purchase orders first.");
      return;
    }
    const required = ["po_number", "due_date", "stock_code", "quantity"];
    if (required.some((key) => !mappings.purchase_orders[key])) {
      setMessage("Purchase order mapping is incomplete. An administrator must map all required fields in Settings.");
      return;
    }
    setMessage("Importing purchase orders...");
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { cellDates: true });
    const settings = mappingSettings.purchase_orders || { has_headers:true, header_row:1, data_start_row:2 };\n    const rows = readImportRows(workbook.Sheets[workbook.SheetNames[0]], settings);
    const map = mappings.purchase_orders;
    const imported: PurchaseOrder[] = rows.map((row) => {
      const ordered = toNumber(row[map.quantity]);
      const delivered = map.quantity_delivered ? toNumber(row[map.quantity_delivered]) : 0;
      return {
        poNumber: String(row[map.po_number] ?? "").trim(),
        stockCode: String(row[map.stock_code] ?? "").trim(),
        description: map.description ? String(row[map.description] ?? "") : "",
        supplier: map.supplier ? String(row[map.supplier] ?? "") : "",
        orderDate: map.order_date ? parseDate(row[map.order_date]) : "",
        dueDate: parseDate(row[map.due_date]),
        quantityOutstanding: Math.max(0, ordered - delivered),
      };
    }).filter((p) => p.poNumber && p.stockCode && p.quantityOutstanding > 0);

    const { error: deleteError } = await supabase.from("purchase_orders").delete().eq("org_id", membership.orgId);
    if (deleteError) { setMessage(`Could not replace PO data: ${deleteError.message}`); return; }
    const { error } = await supabase.from("purchase_orders").insert(imported.map((p) => ({ org_id: membership.orgId, po_number: p.poNumber, stock_code: p.stockCode, description: p.description, supplier: p.supplier, order_date: p.orderDate || null, due_date: p.dueDate || null, quantity_outstanding: p.quantityOutstanding })));
    if (error) { setMessage(`Could not save PO data: ${error.message}`); return; }
    await loadData(membership.orgId);
    setMessage(`Imported and saved ${imported.length.toLocaleString()} open/part-delivered PO lines from ${file.name}.`);
  }

  const hasModule = (key: string) => enabledModules.includes(key);

  const visibleStocks = useMemo(() => selectedGroups.length === 0 ? stocks : stocks.filter((s) => selectedGroups.includes(s.stockGroup)), [stocks, selectedGroups]);

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
        <div><div className="eyebrow">FLOW MANAGER</div><h1>Flow, without the fuss.</h1><p>{membership.orgName} · {membership.role}</p></div>
        <div className="top-actions">
          {isGukAdmin && <button onClick={() => window.location.href="/backoffice"}>← Back to GUK Back Office</button>}
          {hasModule("stock") && <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>Stock</button>}
          {hasModule("pta") && <button onClick={() => setMessage("PTA module is enabled. The daily replenishment screen is next.")}>PTA</button>}
          {hasModule("purchase_orders") && <button onClick={() => setMessage("Purchase Orders module is enabled. The priority screen is next.")}>Purchase Orders</button>}
          {hasModule("dbr") && <button onClick={() => setMessage("DBR module is enabled. The daily buffer review is next.")}>DBR</button>}
          {(membership.role === "admin" || isGukAdmin) && <button onClick={() => window.location.href=isGukAdmin ? "/settings?preview=1&customer=" + membership.orgId : "/settings"}>Settings</button>}
          <span className="version">v0.3</span><button onClick={signOut}>Sign out</button>
        </div>
      </header>

      {membership.role === "admin" && <section className="card">
        <div className="section-heading"><div><h3>User management</h3><p>Invite people and choose their access level. No public sign-up.</p></div></div>
        <div className="invite-row">
          <input type="email" placeholder="User email address" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "manager" | "viewer")}><option value="admin">Admin</option><option value="manager">Manager</option><option value="viewer">Viewer</option></select>
          <button onClick={inviteUser}>Send invitation</button>
        </div>
        {inviteMessage && <p className="footnote">{inviteMessage}</p>}
      </section>}

      <section className="hero">
        <h2>{membership.orgName}</h2><p>{message}</p>
        {enabledModules.length === 0 && <p className="footnote">No Flow Manager areas have been enabled for this customer. Ask your administrator to enable the required areas.</p>}
        {hasModule("stock") && <div className="uploads">
          <label className="upload"><span>Import Sage Product Details</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && importProducts(e.target.files[0])} /></label>
        </div>}
        {hasModule("purchase_orders") && <div className="uploads">
          <label className="upload secondary"><span>Import Sage Purchase Orders</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && importPurchaseOrders(e.target.files[0])} /></label>
        </div>}
      </section>

      {hasModule("stock") && groups.length > 0 && <section className="card">
        <div className="section-heading"><div><h3>Stock Groups</h3><p>All active products are imported. Choose what to display.</p></div><button onClick={() => setSelectedGroups([])}>Show all</button></div>
        <div className="chips">{groups.map((group) => <button key={group} className={selectedGroups.includes(group) ? "chip selected" : "chip"} onClick={() => setSelectedGroups((current) => current.includes(group) ? current.filter((g) => g !== group) : [...current, group])}>{group || "(No group)"}</button>)}</div>
      </section>}

      {hasModule("stock") && <section className="grid">
        <div className="card metric"><span>Products</span><strong>{visibleStocks.length.toLocaleString()}</strong></div>
        <div className="card metric"><span>PO lines</span><strong>{orders.length.toLocaleString()}</strong></div>
        <div className="card metric"><span>Groups</span><strong>{groups.length.toLocaleString()}</strong></div>
      </section>}

      {hasModule("stock") && <section className="card">
        <div className="section-heading"><div><h3>Stock</h3><p>Current Sage 50 stock position.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Stock code</th><th>Description</th><th>Stock group</th><th>Stock</th><th>Target</th><th>Buffer</th></tr></thead><tbody>
          {visibleStocks.slice(0, 100).map((stock) => { const pct = stock.targetLevel > 0 ? stock.quantity / stock.targetLevel : 0; const status = pct > 1 ? "blue" : pct >= .66 ? "green" : pct >= .33 ? "yellow" : pct > 0 ? "red" : "black"; return <tr key={stock.stockCode}><td>{stock.stockCode}</td><td>{stock.description}</td><td>{stock.stockGroup}</td><td>{stock.quantity}</td><td>{stock.targetLevel}</td><td><span className={`status ${status}`}>{status}</span></td></tr>; })}
          {visibleStocks.length === 0 && <tr><td colSpan={6} className="empty">No stock data yet.</td></tr>}
        </tbody></table></div>{visibleStocks.length > 100 && <p className="footnote">Showing the first 100 rows for now.</p>}
      </section>}
    </main>
  );
}
