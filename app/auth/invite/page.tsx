"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function InvitePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("Checking invitation...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setMessage("This invitation link is invalid or has expired.");
      else { setEmail(data.session.user.email || ""); setReady(true); setMessage(""); }
    });
  }, []);

  async function createPassword() {
    if (password.length < 8) return setMessage("Password must be at least 8 characters.");
    if (password !== confirm) return setMessage("Passwords do not match.");
    setMessage("Creating your account...");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setMessage(error.message); return; }
    router.replace("/");
  }

  return <main><header className="topbar"><div><div className="eyebrow">FLOW MANAGER</div><h1>Welcome to Flow Manager</h1></div><span className="version">Invitation</span></header>
    <section className="card auth">
      {ready ? <>
        <h2>Create your password</h2>
        <p>Your account has been invited. Set a password to complete your registration.</p>
        <label>Email address<input type="email" value={email} disabled /></label>
        <label>Password<input type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label>Confirm password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        <button onClick={createPassword}>Create account</button>
      </> : <p>{message}</p>}
      {message && ready && <p className="footnote">{message}</p>}
    </section>
  </main>;
}
