"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Company = {
  name: string;
  ico: string | null;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  vatStatus: string;
  defaultDueDays: number;
};

const emptyCompany: Company = {
  name: "",
  ico: null,
  dic: null,
  street: null,
  city: null,
  zip: null,
  country: "CZ",
  phone: null,
  email: null,
  website: null,
  logoUrl: null,
  vatStatus: "NON_VAT_PAYER",
  defaultDueDays: 14,
};

export default function NastaveniPage() {
  const [company, setCompany] = useState<Company>(emptyCompany);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/company/me")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Nepodařilo se načíst údaje firmy.");
        if (data.company) {
          setCompany({
            ...emptyCompany,
            ...data.company,
          });
        }
      })
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, []);

  function update(field: keyof Company, value: string | number) {
    setCompany((current) => ({ ...current, [field]: value }));
    setMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/company/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(company),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Uložení se nepodařilo.");

      setCompany({ ...emptyCompany, ...data.company });
      setMessage("Údaje firmy byly uloženy.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Uložení se nepodařilo.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="content">
          <p className="page-subtitle">Načítám nastavení…</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Správa firmy</p>
            <h1 className="page-title">Nastavení</h1>
            <p className="page-subtitle">
              Údaje firmy, které se používají pro fakturaci a další doklady.
            </p>
          </div>
        </header>

        {message && (
          <div className={message.includes("uloženy") ? "auth-success settings-message" : "auth-error settings-message"}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <section className="panel settings-panel">
            <div className="panel-header">
              <div>
                <h2>Základní údaje</h2>
                <span>Všechny údaje zůstávají kdykoliv upravitelné.</span>
              </div>
            </div>
            <div className="settings-grid">
              <Field label="Název firmy" value={company.name} required onChange={(value) => update("name", value)} />
              <Field label="IČO" value={company.ico ?? ""} onChange={(value) => update("ico", value)} />
              <Field label="DIČ" value={company.dic ?? ""} onChange={(value) => update("dic", value)} />
              <Field label="Ulice a číslo" value={company.street ?? ""} onChange={(value) => update("street", value)} />
              <Field label="Město" value={company.city ?? ""} onChange={(value) => update("city", value)} />
              <Field label="PSČ" value={company.zip ?? ""} onChange={(value) => update("zip", value)} />
              <Field label="Země" value={company.country} onChange={(value) => update("country", value)} />
              <Field label="Telefon" value={company.phone ?? ""} onChange={(value) => update("phone", value)} />
              <Field label="E-mail" type="email" value={company.email ?? ""} onChange={(value) => update("email", value)} />
              <Field label="Web" value={company.website ?? ""} onChange={(value) => update("website", value)} />
              <Field label="Logo URL" value={company.logoUrl ?? ""} onChange={(value) => update("logoUrl", value)} />
              <div className="auth-field">
                <label htmlFor="vatStatus">Režim DPH</label>
                <select id="vatStatus" value={company.vatStatus} onChange={(event) => update("vatStatus", event.target.value)}>
                  <option value="NON_VAT_PAYER">Nejsem plátce DPH</option>
                  <option value="VAT_PAYER">Jsem plátce DPH</option>
                </select>
              </div>
              <div className="auth-field">
                <label htmlFor="defaultDueDays">Výchozí splatnost (dny)</label>
                <input
                  id="defaultDueDays"
                  type="number"
                  min="0"
                  max="365"
                  value={company.defaultDueDays}
                  onChange={(event) => update("defaultDueDays", Number(event.target.value))}
                />
              </div>
            </div>
          </section>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Ukládám…" : "Uložit změny"}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}{required ? " *" : ""}</label>
      <input id={id} type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
