import Link from "next/link";

const primaryNavigation = [
  ["⌂", "Přehled", "/"],
  ["▤", "Faktury", "/faktury"],
  ["▣", "Zálohy", "/zalohy"],
  ["↔", "Úhrady", "/uhrady"],
  ["▥", "Pokladna", "/pokladna"],
  ["♙", "Zákazníci", "/zakaznici"],
];

const secondaryNavigation = [
  ["◫", "Přehledy", "/prehledy"],
];

const accountNavigation = [
  ["⚙", "Nastavení", "/nastaveni"],
  ["●", "Můj účet", "/ucet"],
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div className="brand-copy">
            <strong>Fakturace</strong>
            <span>Jednoduše a přehledně</span>
          </div>
        </div>

        <div className="company-switcher">
          <span>Aktivní firma</span>
          Moje firma <b>⌄</b>
        </div>

        <nav className="nav" aria-label="Hlavní navigace">
          {primaryNavigation.map(([icon, label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}

          <div className="nav-section">Přehledy</div>
          {secondaryNavigation.map(([icon, label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}

          <div className="nav-section">Správa</div>
          {accountNavigation.map(([icon, label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">JP</div>
            <div>
              <strong>Uživatel</strong>
              <span>Přihlášený účet</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="mobile-header">
          <span className="mobile-brand">Fakturace</span>
          <button className="mobile-menu-button" aria-label="Otevřít menu">☰</button>
        </header>
        {children}
      </main>
    </div>
  );
}
