"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function PrihlaseniPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const result = await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "Přihlášení se nepodařilo.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">F</div>
          <strong>Fakturace</strong>
        </div>
        <h1>Přihlášení</h1>
        <p className="auth-subtitle">Přihlaste se ke svému fakturačnímu účtu.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="auth-field">
            <label htmlFor="password">Heslo</label>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="button button-primary" type="submit" disabled={loading}>
            {loading ? "Přihlašuji…" : "Přihlásit se"}
          </button>
        </form>

        <div className="auth-switch">
          Nemáte účet? <Link href="/registrace">Vytvořit účet</Link>
        </div>
      </section>
    </main>
  );
}
