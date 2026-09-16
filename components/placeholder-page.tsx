import { AppShell } from "@/components/app-shell";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <AppShell>
      <div className="content">
        <header className="page-header">
          <div>
            <p className="eyebrow">Modul aplikace</p>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">{description}</p>
          </div>
          <button className="button button-primary">＋ Nový</button>
        </header>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Připraveno pro další fázi</h2>
              <span>Struktura obrazovky je založená na schváleném návrhu aplikace.</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
