"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function CompanySetupPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [ico, setIco] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace("/prihlaseni");
  }, [isPending, session, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ico, email }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "Firmu se nepodařilo vytvořit.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  if (isPending || !session) return null;

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark">F</div><strong>Fakturace</strong></div>
        <h1>Nastavení firmy</h1>
        <p className="auth-subtitle">Ještě poslední krok. Účet máme, teď potřebujeme údaje firmy, pod kterou budete vystavovat doklady.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="company-name">Název firmy</label>
            <input id="company-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="ico">IČO <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(volitelné)</span></label>
            <input id="ico" type="text" inputMode="numeric" value={ico} onChange={(e) => setIco(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="company-email">Firemní e-mail <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(volitelné)</span></label>
            <input id="company-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="button button-primary" type="submit" disabled={loading}>{loading ? "Vytvářím firmu…" : "Vytvořit firmu"}</button>
        </form>
      </section>
    </main>
  );
}
