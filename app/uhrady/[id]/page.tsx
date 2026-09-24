"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";

type Payment = {
  id: string; amount: string | number; paidAt: string; method: string; note: string | null;
  invoice: { id: string; number: string | null; total: string | number; customer: { name: string } | null };
  cashDocument: { id: string; number: string | null } | null;
};

export default function UhradaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [form, setForm] = useState({ amount: "", paidAt: "", method: "BANK_TRANSFER", note: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await fetch("/api/payments/" + id);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage(data.error ?? "Úhradu se nepodařilo načíst."); return; }
    setPayment(data.payment);
    setForm({
      amount: String(data.payment.amount),
      paidAt: new Date(data.payment.paidAt).toISOString().slice(0, 10),
      method: data.payment.method,
      note: data.payment.note ?? "",
    });
  }

  useEffect(() => { load().catch(() => setMessage("Úhradu se nepodařilo načíst.")); }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMessage("");
    try {
      const r = await fetch("/api/payments/" + id, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Úhradu se nepodařilo upravit.");
      setPayment(data.payment);
      setMessage("Úhrada byla upravena.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Úhradu se nepodařilo upravit.");
    } finally { setSaving(false); }
  }

  if (!payment) return <AppShell><div className="content"><Link className="button button-secondary" href="/uhrady">← Úhrady</Link>{message && <div className="auth-error settings-message">{message}</div>}</div></AppShell>;

  return <AppShell><div className="content">
    <header className="page-header">
      <div><p className="eyebrow">Finance</p><h1 className="page-title">Úprava úhrady</h1><p className="page-subtitle">{payment.invoice.number ?? "Doklad bez čísla"} · {payment.invoice.customer?.name ?? "Bez zákazníka"}</p></div>
      <div className="customer-actions print-hide">
        <Link className="button button-secondary" href={"/doklad/" + payment.invoice.id + "?edit=1"}>Faktura</Link>
        <Link className="button button-secondary" href="/uhrady">← Úhrady</Link>
      </div>
    </header>
    {message && <div className={message === "Úhrada byla upravena." ? "auth-success settings-message" : "auth-error settings-message"}>{message}</div>}
    <form className="panel invoice-editor" onSubmit={save}>
      <div className="panel-header"><div><h2>Úhrada {payment.invoice.number ?? ""}</h2><span>Změna hotovostní úhrady automaticky aktualizuje pokladní doklad.</span></div></div>
      <div className="settings-grid">
        <div className="auth-field"><label>Faktura</label><input value={payment.invoice.number ?? "-"} disabled /></div>
        <Field label="Částka" type="number" value={form.amount} onChange={v => setForm({ ...form, amount: v })} />
        <Field label="Datum úhrady" type="date" value={form.paidAt} onChange={v => setForm({ ...form, paidAt: v })} />
        <div className="auth-field"><label>Způsob úhrady</label><select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}><option value="BANK_TRANSFER">Bankovní převod</option><option value="CASH">Hotově</option><option value="CARD">Kartou</option><option value="OTHER">Jiné</option></select></div>
        <Field label="Poznámka" value={form.note} onChange={v => setForm({ ...form, note: v })} />
      </div>
      <div className="invoice-form-actions">
        <Link className="button button-secondary" href="/uhrady">Zrušit</Link>
        <button className="button button-primary" disabled={saving}>{saving ? "Ukládám…" : "Uložit změny"}</button>
      </div>
    </form>
    {payment.cashDocument && <section className="panel detail-card">
      <div className="panel-header"><div><h2>Pokladní doklad</h2><span>{payment.cashDocument.number ?? "-"}</span></div></div>
      <p className="table-muted">Pokladní doklad je navázaný na tuto úhradu. Jeho datum, částka a poznámka se mění společně s úhradou.</p>
      <Link className="button button-secondary button-small" href={"/pokladna/" + payment.cashDocument.id}>Zobrazit doklad</Link>
    </section>}
  </div></AppShell>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <div className="auth-field"><label>{label}</label><input type={type} value={value} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} onChange={e => onChange(e.target.value)} /></div>;
}
