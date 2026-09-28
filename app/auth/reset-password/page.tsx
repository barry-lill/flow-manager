"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");

  async function resetPassword() {
    if (password.length < 8) return setMessage("Password must be at least 8 characters.");
    if (password !== confirm) return setMessage("Passwords do not match.");
    setMessage("Updating password...");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Password updated. Signing you in...");
    router.replace("/");
  }

  return (
    <main>
      <header className="topbar">
        <div><div className="eyebrow">FLOW MANAGER</div><h1>Choose a new password</h1></div>
        <span className="version">Account</span>
      </header>
      <section className="card auth">
        <h2>Set your password</h2>
        <p>Choose a new password of at least 8 characters.</p>
        <input type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button onClick={resetPassword}>Update password</button>
        {message && <p className="footnote">{message}</p>}
      </section>
    </main>
  );
}
