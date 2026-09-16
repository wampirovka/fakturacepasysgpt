"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const primaryNavigation = [
  ["⌂", "Přehled", "/"],
  ["▤", "Faktury", "/faktury"],
  ["▣", "Zálohy", "/zalohy"],
  ["↔", "Úhrady", "/uhrady"],
  ["▥", "Pokladna", "/pokladna"],
  ["♙", "Zákazníci", "/zakaznici"],
];

const secondaryNavigation = [["◫", "Přehledy", "/prehledy"]];
const accountNavigation = [["⚙", "Nastavení", "/nastaveni"], ["●", "Můj účet", "/ucet"]];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/prihlaseni");
    router.refresh();
  }

  const initials = session?.user.name
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "U";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">F</div><div className="brand-copy"><strong>Fakturace</strong><span>Jednoduše a přehledně</span></div></div>
        <div className="company-switcher"><span>Aktivní firma</span>Moje firma <b>⌄</b></div>

        <nav className="nav" aria-label="Hlavní navigace">
          {primaryNavigation.map(([icon, label, href]) => <Link className="nav-link" href={href} key={href}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}</Link>)}
          <div className="nav-section">Přehledy</div>
          {secondaryNavigation.map(([icon, label, href]) => <Link className="nav-link" href={href} key={href}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}</Link>)}
          <div className="nav-section">Správa</div>
          {accountNavigation.map(([icon, label, href]) => <Link className="nav-link" href={href} key={href}><span className="nav-icon" aria-hidden="true">{icon}</span>{label}</Link>)}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div><strong>{session?.user.name ?? "Uživatel"}</strong><span>{session?.user.email ?? "Přihlášený účet"}</span></div>
          </div>
          <button className="button button-secondary" style={{ width: "100%", marginTop: 8 }} onClick={handleSignOut}>Odhlásit se</button>
        </div>
      </aside>

      <main className="main">
        <header className="mobile-header"><span className="mobile-brand">Fakturace</span><button className="mobile-menu-button" aria-label="Otevřít menu">☰</button></header>
        {children}
      </main>
    </div>
  );
}
