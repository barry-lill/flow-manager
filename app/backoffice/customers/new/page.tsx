"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Module = { key: string; name: string; sort_order: number };

export default function NewCustomer() {
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
      const accessResponse = await fetch("/api/backoffice/access", { headers: { Authorization: "Bearer " + token } });
      const accessResult = await accessResponse.json();
      if (!accessResponse.ok || !accessResult.allowed) { setAllowed(false); return; }

      const response = await fetch("/api/modules", { headers: { Authorization: "Bearer " + token } });
      const result = await response.json();
      if (!response.ok) { setAllowed(false); return; }
      setModules(result.modules || []);
      setSelected((result.modules || []).map((m: Module) => m.key));
      setAllowed(true);
    });
  }, []);

  async function createCustomer() {
    if (!company.trim() || !primaryEmail.trim()) return setMessage("Company and primary administrator email are required.");
    setSaving(true); setMessage("Creating customer...");
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/backoffice/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
      body: JSON.stringify({ company: company.trim(), primaryEmail: primaryEmail.trim(), gukEmail: gukEmail.trim(), modules: selected }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage("Could not create customer: " + (result.error || "Unknown error")); return; }
    setMessage(result.invitationSent === false ? `${company} created and the existing primary user was added.` : `${company} created. The primary administrator invitation has been sent.`);
    setCompany(""); setPrimaryEmail(""); setGukEmail("");
  }

  if (allowed === null) return <main><section className="hero"><h2>Flow Manager Back Office</h2><p>Checking access...</p></section></main>;
  if (!allowed) return <main><section className="card auth"><h2>Access denied</h2><p>The GUK back office is restricted to authorised GUK users.</p></section></main>;

  return <main>
    <header className="topbar"><div><div className="eyebrow">FLOW MANAGER · GUK</div><h1>Add New Customer</h1><p>{email}</p></div><Link href="/backoffice">Back to customers</Link></header>
    <section className="card">
      <div className="section-heading"><div><h2>Customer details</h2><p>Create a new Flow Manager organisation.</p></div></div>
      <div className="form-grid">
        <label>Company name<input placeholder="Enter company name" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
        <label>Primary administrator email<input type="email" placeholder="admin@customer.co.uk" value={primaryEmail} onChange={(e) => setPrimaryEmail(e.target.value)} /></label>
        <label>GUK user — view only<input type="email" placeholder="Optional" value={gukEmail} onChange={(e) => setGukEmail(e.target.value)} /></label>
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
