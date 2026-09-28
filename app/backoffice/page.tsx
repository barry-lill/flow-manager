"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Module = { key: string; name: string; sort_order: number };

export default function BackOffice() {
  const [email, setEmail] = useState("");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [company, setCompany] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [gukEmail, setGukEmail] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setAllowed(false); return; }
      setEmail(data.session.user.email || "");
      const token = data.session.access_token;
      const response = await fetch("/api/modules", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) { setAllowed(false); return; }
      setModules(result.modules || []);
      setSelected((result.modules || []).map((m: Module) => m.key));
      setAllowed(true);
    });
  }, []);

  async function createCustomer() {
    if (!company.trim() || !primaryEmail.trim()) return setMessage("Company and primary admin email are required.");
    setSaving(true); setMessage("Creating customer and sending invitation...");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/backoffice/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
      body: JSON.stringify({ company, primaryEmail, gukEmail, modules: selected }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(result.error || "Could not create customer."); return; }
    setMessage(`${company} created. The primary administrator invitation has been sent.`);
    setCompany(""); setPrimaryEmail(""); setGukEmail("");
  }

  if (allowed === null) return <main><section className="hero"><h2>Flow Manager Back Office</h2><p>Checking access...</p></section></main>;
  if (!allowed) return <main><section className="card auth"><h2>Access denied</h2><p>The GUK back office is restricted to authorised GUK users.</p></section></main>;

  return <main>
    <header className="topbar"><div><div className="eyebrow">FLOW MANAGER · GUK</div><h1>Back Office</h1><p>{email}</p></div><button onClick={() => supabase.auth.signOut().then(() => location.href = "/")}>Sign out</button></header>
    <section className="card">
      <div className="section-heading"><div><h2>Add customer</h2><p>Create the organisation and invite its primary administrator.</p></div></div>
      <div className="form-grid">
        <label>Company name<input placeholder="Dutch Maid" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
        <label>Primary administrator email<input type="email" placeholder="admin@customer.co.uk" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} /></label>
        <label>GUK user — view only<input type="email" placeholder="optional" value={gukEmail} onChange={(e) => setGukEmail(e.target.value)} /></label>
      </div>
    </section>
    <section className="card">
      <div className="section-heading"><div><h3>Enabled Flow Manager areas</h3><p>Only selected areas will be available to this customer.</p></div></div>
      <div className="module-list">{modules.map((m) => <label className="module-option" key={m.key}><input type="checkbox" checked={selected.includes(m.key)} onChange={() => setSelected((current) => current.includes(m.key) ? current.filter((x) => x !== m.key) : [...current, m.key])} /><span>{m.name}</span></label>)}</div>
      <button className="primary-action" disabled={saving} onClick={createCustomer}>{saving ? "Creating..." : "Create customer"}</button>
      {message && <p className="footnote">{message}</p>}
    </section>
  </main>;
}
