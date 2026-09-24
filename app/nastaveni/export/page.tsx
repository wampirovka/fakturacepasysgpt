"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const OPTIONS = [
  { key: "company", label: "Firma", description: "Údaje firmy a nastavení." },
  { key: "customers", label: "Zákazníci", description: "Zákazníci včetně jejich původních ID." },
  { key: "invoices", label: "Faktury", description: "Běžné, zálohové i opravné doklady." },
  { key: "invoiceItems", label: "Položky faktur", description: "Položky navázané přes invoiceId." },
  { key: "payments", label: "Úhrady", description: "Úhrady faktur se zachovanými vazbami." },
  { key: "cashDocuments", label: "Pokladní doklady", description: "Pokladní doklady a jejich vazby na úhrady." },
  { key: "advanceApplications", label: "Vypořádání záloh", description: "Vazby konečných faktur na zálohy." },
  { key: "numberingSeries", label: "Číselné řady", description: "Nastavení číslování dokladů." },
  { key: "auditLog", label: "Auditní log", description: "Historie změn firmy." },
] as const;

type Key = (typeof OPTIONS)[number]["key"];

const ALL = OPTIONS.map((item) => item.key);

export default function ExportPage() {
  const [selected, setSelected] = useState<Key[]>(ALL);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  const allSelected = selected.length === ALL.length;
  const selectedLabel = useMemo(() => {
    if (allSelected) return "Kompletní export";
    return selected.length + " oblastí";
  }, [allSelected, selected.length]);

  function toggle(key: Key) {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
    setMessage("");
  }

  function selectAll() {
    setSelected(ALL);
    setMessage("");
  }

  function clearAll() {
    setSelected([]);
    setMessage("");
  }

  async function exportData() {
    if (!selected.length) {
      setMessage("Vyber alespoň jednu oblast.");
      return;
    }

    setExporting(true);
    setMessage("");

    try {
      const params = new URLSearchParams({
        entities: selected.join(","),
        ...(allSelected ? { all: "1" } : {}),
      });
      const response = await fetch("/api/export?" + params.toString());

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Export se nepodařilo vytvořit.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fakturace-export-" + new Date().toISOString().slice(0, 10) + ".zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Export byl vytvořen a stažen.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export se nepodařilo vytvořit.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <div className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Data firmy</p>
            <h1 className="page-title">Export dat</h1>
            <p className="page-subtitle">
              Vyber data, která chceš exportovat. Vazby mezi záznamy zůstávají zachované přes původní ID.
            </p>
          </div>
          <div className="customer-actions">
            <Link className="button button-secondary" href="/nastaveni">Zpět do nastavení</Link>
          </div>
        </header>

        {message && (
          <div className={message.includes("stažen") ? "auth-success settings-message" : "auth-error settings-message"}>
            {message}
          </div>
        )}

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Co exportovat</h2>
              <span>{selectedLabel}</span>
            </div>
            <div className="customer-actions">
              <button className="button button-secondary" type="button" onClick={selectAll}>Vybrat vše</button>
              <button className="button button-secondary" type="button" onClick={clearAll}>Zrušit výběr</button>
            </div>
          </div>

          <div style={{ padding: 18, display: "grid", gap: 10 }}>
            {OPTIONS.map((option) => {
              const checked = selected.includes(option.key);
              return (
                <label
                  key={option.key}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    padding: 14,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: checked ? "var(--accent-soft)" : "var(--surface)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(option.key)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small style={{ display: "block", marginTop: 3, color: "var(--muted)" }}>
                      {option.description}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Exportní formát</h2>
              <span>Verze 1.0 · kompatibilní s budoucím importem a převodem do jiné databáze.</span>
            </div>
          </div>
          <div style={{ padding: 18 }}>
            <p style={{ margin: 0 }}>
              Export vznikne jako ZIP. Uvnitř budou jednotlivé JSON soubory a <strong>manifest.json</strong>.
              ID záznamů se nemění, takže lze zachovat vztahy faktura → položky → úhrada → pokladní doklad
              a faktura → záloha → vypořádání.
            </p>
            <p className="field-help" style={{ marginTop: 10 }}>
              Přihlašovací účty, hesla, session tokeny a OAuth údaje se do firemního exportu neukládají.
            </p>
          </div>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            className="button button-primary"
            type="button"
            disabled={exporting || !selected.length}
            onClick={exportData}
          >
            {exporting ? "Připravuji export…" : "Exportovat data"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
