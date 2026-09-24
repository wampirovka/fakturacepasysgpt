"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

type Summary = {
  version?: string;
  exportedAt?: string;
  sourceCompanyId?: string;
  currentCompanyId?: string;
  counts?: Record<string, number>;
  errors?: string[];
  warnings?: string[];
  canImport?: boolean;
  imported?: boolean;
  error?: string;
};

const labels: Record<string,string> = {
  company:"Firma", members:"Členové firmy", customers:"Zákazníci", invoices:"Faktury",
  invoiceItems:"Položky faktur", payments:"Úhrady", cashDocuments:"Pokladní doklady",
  advanceApplications:"Vypořádání záloh", numberingSeries:"Číselné řady", auditLog:"Auditní log"
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function validate() {
    if (!file) { setMessage("Vyber ZIP export."); return; }
    setLoading(true); setMessage(""); setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/import", { method:"POST", body:form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Validace se nepodařila.");
      setSummary(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validace se nepodařila.");
    } finally { setLoading(false); }
  }

  async function executeImport() {
    if (!file || !summary?.canImport) return;
    if (!window.confirm("Import přepíše stejné záznamy podle jejich ID. Pokračovat?")) return;
    setLoading(true); setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("execute", "1");
      const response = await fetch("/api/import", { method:"POST", body:form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Import se nepodařil.");
      setSummary(data);
      setMessage("Import byl dokončen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import se nepodařil.");
    } finally { setLoading(false); }
  }

  return (
    <AppShell>
      <div className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Data firmy</p>
            <h1 className="page-title">Import dat</h1>
            <p className="page-subtitle">Nejdřív proběhne pouze kontrola ZIPu. Do databáze se nic nezapisuje.</p>
          </div>
          <div className="customer-actions">
            <Link className="button button-secondary" href="/nastaveni/export">Export dat</Link>
            <Link className="button button-secondary" href="/nastaveni">Zpět do nastavení</Link>
          </div>
        </header>

        {message && <div className={message.includes("dokončen") ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}

        <section className="panel">
          <div className="panel-header">
            <div><h2>1. Vyber export</h2><span>Podporovaný formát: fakturace-export 1.0 · ZIP do 50 MB.</span></div>
          </div>
          <div style={{padding:18, display:"grid", gap:14}}>
            <input type="file" accept=".zip,application/zip" onChange={e => { setFile(e.target.files?.[0] ?? null); setSummary(null); setMessage(""); }} />
            {file && <span className="field-help">Vybrán soubor: {file.name} ({Math.ceil(file.size / 1024)} kB)</span>}
            <div>
              <button className="button button-primary" type="button" onClick={validate} disabled={!file || loading}>
                {loading ? "Kontroluji…" : "Zkontrolovat export"}
              </button>
            </div>
          </div>
        </section>

        {summary && (
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>2. Validační náhled</h2>
                <span>{summary.version} · exportováno {summary.exportedAt ? new Date(summary.exportedAt).toLocaleString("cs-CZ") : "neuvedeno"}</span>
              </div>
              <span className={summary.canImport ? "status status-paid" : "status status-overdue"}>
                {summary.canImport ? "Připraveno k importu" : "Nelze importovat"}
              </span>
            </div>

            <div style={{padding:18}}>
              {summary.counts && (
                <div className="dashboard-grid" style={{marginBottom:16}}>
                  {Object.entries(summary.counts).map(([key,count]) => (
                    <div className="stat-card" key={key}>
                      <span className="stat-label">{labels[key] ?? key}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              )}

              {!!summary.warnings?.length && (
                <div className="auth-error" style={{marginBottom:12}}>
                  <strong>Upozornění</strong>
                  <ul>{summary.warnings.map((item,i)=><li key={i}>{item}</li>)}</ul>
                </div>
              )}

              {!!summary.errors?.length && (
                <div className="auth-error" style={{marginBottom:12}}>
                  <strong>Chyby</strong>
                  <ul>{summary.errors.map((item,i)=><li key={i}>{item}</li>)}</ul>
                </div>
              )}

              {summary.imported ? (
                <div className="auth-success">Data byla importována. Stávající záznamy se stejným ID byly aktualizovány, chybějící byly vytvořeny.</div>
              ) : (
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}>
                  <button className="button button-primary" type="button" disabled={!summary.canImport || loading} onClick={executeImport}>
                    {loading ? "Importuji…" : "Provést import"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
