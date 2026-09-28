"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Customer = { id: string; name: string; created_at: string; organization_modules: { module_key: string; enabled: boolean }[] };

export default function BackOfficeHome() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [email, setEmail] = useState("");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [message, setMessage] = useState("Loading customers...");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { setAllowed(false); return; }
      setEmail(data.session.user.email || "");
      const token = data.session.access_token;
      const access = await fetch("/api/backoffice/access", { headers: { Authorization: "Bearer " + token } });
      const accessResult = await access.json();
      if (!access.ok || !accessResult.allowed) { setAllowed(false); return; }

      const response = await fetch("/api/backoffice/customers/list", { headers: { Authorization: "Bearer " + token } });
      const result = await response.json();
      if (!response.ok) { setMessage(result.error || "Could not load customers."); setAllowed(true); return; }
      setCustomers(result.customers || []);
      setMessage("");
      setAllowed(true);
    });
  }, []);

  if (allowed === null) return <main><section className="hero"><h2>Flow Manager Back Office</h2><p>Checking access...</p></section></main>;
  if (!allowed) return <main><section className="card auth"><h2>Access denied</h2><p>The GUK back office is restricted to authorised GUK users.</p></section></main>;

  return <main>
    <header className="topbar">
      <div><div className="eyebrow">FLOW MANAGER · GUK</div><h1>Back Office</h1><p>{email}</p></div>
      <button onClick={() => supabase.auth.signOut().then(() => location.href = "/")}>Sign out</button>
    </header>

    <section className="hero">
      <div className="section-heading">
        <div><h2>Customers</h2><p>Manage the organisations using Flow Manager.</p></div>
        <Link className="primary-action" href="/backoffice/customers/new">Add New Customer</Link>
      </div>
    </section>

    <section className="card">
      {message && <p className="footnote">{message}</p>}
      {!message && customers.length === 0 && <p>No customers have been created yet.</p>}
      {customers.length > 0 && <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Enabled areas</th><th>Created</th><th></th></tr></thead><tbody>
        {customers.map((customer) => {
          const enabled = customer.organization_modules?.filter((m) => m.enabled).length || 0;
          return <tr key={customer.id}>
            <td><strong>{customer.name}</strong></td>
            <td>{enabled}</td>
            <td>{new Date(customer.created_at).toLocaleDateString("en-GB")}</td>
            <td><Link href={"/backoffice/customers/" + customer.id}>View</Link></td>
          </tr>;
        })}
      </tbody></table></div>}
    </section>
  </main>;
}
