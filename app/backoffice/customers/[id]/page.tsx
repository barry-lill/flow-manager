"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Module = { key: string; name: string; sort_order: number };
type Customer = {
  id: string; name: string; created_at: string;
  organization_modules: { module_key: string; enabled: boolean }[];
  data_sources: { source_key: string; name: string; configured: boolean }[];
};
type CustomerUser = { email: string; role: string };

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [gukEmail, setGukEmail] = useState("");
  const [addingGuk, setAddingGuk] = useState(false);
  const [message, setMessage] = useState("Loading customer...");
  const [saving, setSaving] = useState(false);

  async function token() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  }

  useEffect(() => {
    (async () => {
      const accessToken = await token();
      if (!accessToken) { setMessage("Please sign in again."); return; }
      const headers = { Authorization: "Bearer " + accessToken };
      const [customerResponse, modulesResponse] = await Promise.all([
        fetch("/api/backoffice/customers/" + params.id, { headers }),
        fetch("/api/modules", { headers }),
      ]);
      const customerResult = await customerResponse.json();
      const modulesResult = await modulesResponse.json();
      if (!customerResponse.ok) { setMessage(customerResult.error || "Could not load customer."); return; }
      if (!modulesResponse.ok) { setMessage(modulesResult.error || "Could not load Flow Manager areas."); return; }
      const loaded = customerResult.customer as Customer;
      setCustomer(loaded);
      setModules(modulesResult.modules || []);
      setSelected((loaded.organization_modules || []).filter((m) => m.enabled).map((m) => m.module_key));
      setUsers(customerResult.users || []);
      setMessage("");
    })();
  }, [params.id]);

  async function saveModules() {
    setSaving(true);
    setMessage("Saving Flow Manager areas...");
    const accessToken = await token();
    const response = await fetch("/api/backoffice/customers/" + params.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
      body: JSON.stringify({ modules: selected }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setMessage(result.error || "Could not save Flow Manager areas."); return; }
    setCustomer(result.customer);
    setMessage("Flow Manager areas saved.");
  }

  if (!customer) return <main><section className="hero"><p>{message}</p></section></main>;

  return <main>
    <header className="topbar"><div><div className="eyebrow">FLOW MANAGER · GUK</div><h1>{customer.name}</h1><p>Customer administration</p></div><Link href="/backoffice">Back to customers</Link></header>
    <section className="card">
      <div className="section-heading"><div><h2>{customer.name}</h2><p>Created {new Date(customer.created_at).toLocaleDateString("en-GB")}</p></div></div>
      <div className="section-heading"><div><h3>Flow Manager areas</h3><p>Select the areas this customer has access to. You can change these at any time.</p></div></div>
      <div className="module-list">{modules.map((module) => (
        <label className="module-option" key={module.key}>
          <input type="checkbox" checked={selected.includes(module.key)}
            onChange={() => setSelected(current => current.includes(module.key) ? current.filter(key => key !== module.key) : [...current, module.key])} />
          <span>{module.name}</span>
        </label>
      ))}</div>
      <button className="primary-action" disabled={saving} onClick={saveModules}>{saving ? "Saving..." : "Save Flow Manager areas"}</button>
      {message && <p className="footnote">{message}</p>}
    </section>
    <section className="card">
      <div className="section-heading">
        <div>
          <h3>Customer access</h3>
          <p>Email addresses that currently have access to this customer.</p>
        </div>
        <a href={"/?preview=1&customer=" + customer.id} className="primary-action">Open customer view</a>
      </div>
      <div className="table-wrap"><table><thead><tr><th>Email address</th><th>Access</th></tr></thead><tbody>
        {users.map((user) => <tr key={user.email + user.role}><td>{user.email}</td><td>{user.role === "guk_viewer" ? "GUK view-only" : user.role}</td></tr>)}
        {users.length === 0 && <tr><td colSpan={2} className="empty">No users have access.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="card">
      <div className="section-heading">
        <div><h3>GUK users</h3><p>Add GUK team members who need view-only access to this customer.</p></div>
      </div>
      <div className="invite-row">
        <input type="email" placeholder="GUK email address" value={gukEmail} onChange={e => setGukEmail(e.target.value)} />
        <button disabled={addingGuk || !gukEmail.trim()} onClick={async () => {
          setAddingGuk(true); setMessage("Adding GUK user...");
          const accessToken = await token();
          const response = await fetch("/api/backoffice/customers/" + params.id + "/users", {
            method:"POST",
            headers:{"Content-Type":"application/json",Authorization:"Bearer "+accessToken},
            body:JSON.stringify({email:gukEmail.trim()})
          });
          const result = await response.json();
          setAddingGuk(false);
          if (!response.ok) { setMessage(result.error || "Could not add GUK user."); return; }
          setUsers(result.users || []);
          setGukEmail("");
          setMessage(result.invitationSent ? "GUK user added and invitation sent." : "GUK user added.");
        }}>Add GUK user</button>
      </div>
    </section>
    <section className="card">
      <h3>Data sources</h3>
      <div className="table-wrap"><table><thead><tr><th>Source</th><th>Configured</th></tr></thead><tbody>
        {customer.data_sources?.map(source => <tr key={source.source_key}><td>{source.name}</td><td>{source.configured ? "Yes" : "Not configured"}</td></tr>)}
      </tbody></table></div>
    </section>
  </main>;
}
