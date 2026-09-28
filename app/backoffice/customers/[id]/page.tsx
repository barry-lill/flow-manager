"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Customer = { id: string; name: string; created_at: string; organization_modules: { module_key: string; enabled: boolean }[]; data_sources: { source_key: string; name: string; configured: boolean }[] };

export default function CustomerDetail() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [message, setMessage] = useState("Loading customer...");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) { setMessage("Please sign in again."); return; }
      const response = await fetch("/api/backoffice/customers/" + params.id, { headers: { Authorization: "Bearer " + token } });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Could not load customer."); return; }
      setCustomer(result.customer);
      setMessage("");
    });
  }, [params.id]);

  if (!customer) return <main><section className="hero"><p>{message}</p></section></main>;

  return <main>
    <header className="topbar"><div><div className="eyebrow">FLOW MANAGER · GUK</div><h1>{customer.name}</h1><p>Customer administration</p></div><Link href="/backoffice">Back to customers</Link></header>
    <section className="card">
      <div className="section-heading"><div><h2>{customer.name}</h2><p>Created {new Date(customer.created_at).toLocaleDateString("en-GB")}</p></div></div>
      <h3>Enabled Flow Manager areas</h3>
      <div className="chips">{customer.organization_modules?.filter((m) => m.enabled).map((m) => <span className="chip selected" key={m.module_key}>{m.module_key}</span>)}</div>
    </section>
    <section className="card">
      <h3>Data sources</h3>
      <div className="table-wrap"><table><thead><tr><th>Source</th><th>Configured</th></tr></thead><tbody>
        {customer.data_sources?.map((source) => <tr key={source.source_key}><td>{source.name}</td><td>{source.configured ? "Yes" : "Not configured"}</td></tr>)}
      </tbody></table></div>
    </section>
  </main>;
}
