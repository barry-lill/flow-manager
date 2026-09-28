"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function sendReset() {
    if (!email.trim()) {
      setMessage("Enter your email address.");
      return;
    }
    setMessage("Sending reset link...");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/auth/reset-password",
    });
    setMessage(error ? error.message : "If an account exists for that email, a password reset link has been sent.");
  }

  return (
    <main>
      <header className="topbar">
        <div><div className="eyebrow">FLOW MANAGER</div><h1>Reset your password</h1></div>
        <span className="version">Account</span>
      </header>
      <section className="card auth">
        <h2>Forgotten password?</h2>
        <p>Enter the email address you use to sign in and we&apos;ll send you a reset link.</p>
        <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button onClick={sendReset}>Send reset link</button>
        {message && <p className="footnote">{message}</p>}
        <p className="footnote"><a href="/">Back to sign in</a></p>
      </section>
    </main>
  );
}
