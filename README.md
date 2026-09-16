# Fakturace

Webová aplikace pro fakturaci, zálohy, úhrady, pokladnu a evidenci zákazníků.

## Technologie

- Next.js 16 (App Router)
- React 19
- TypeScript
- PostgreSQL 17
- Prisma ORM 7
- Better Auth

## Lokální spuštění

### 1. Nainstalovat závislosti

```bash
npm install
```

### 2. Spustit PostgreSQL

Projekt obsahuje lokální Docker Compose konfiguraci:

```bash
docker compose up -d postgres
```

### 3. Nastavit prostředí

Zkopírujte `.env.example` do `.env` a nastavte `BETTER_AUTH_SECRET` na náhodný řetězec dlouhý alespoň 32 znaků.

Výchozí lokální PostgreSQL URL je:

```text
postgresql://fakturace:fakturace_dev@localhost:5432/fakturace?schema=public
```

### 4. Vytvořit databázové tabulky

```bash
npm run db:migrate -- --name init
npm run db:generate
```

Migrace vytvoří autentizační tabulky Better Auth a první aplikační tabulky `Company` a `CompanyMember`. Uživatel je zároveň uložen v tabulce `User`.

### 5. Spustit aplikaci

```bash
npm run dev
```

Aplikace běží na `http://localhost:3000`.

## Přihlášení

- `/registrace` vytvoří účet pomocí e-mailu a hesla.
- `/prihlaseni` účet přihlásí.
- aplikační routy jsou chráněné session cookie.
- odhlášení je dostupné v levém menu.

## Datový základ

Každá firma je samostatný tenant. `CompanyMember` propojuje uživatele s firmou a obsahuje roli `OWNER`, `ADMIN`, `EMPLOYEE` nebo `ACCOUNTANT`. Další firemní tabulky budou vždy navázané přes `companyId`, aby data jednotlivých firem zůstala oddělená.

## Aktuální stav

Hotový je základ PostgreSQL + Prisma, autentizace e-mailem a heslem, session ochrana a první více-firemní datový model. Následuje onboarding firmy a následně skutečné faktury, zákazníci a úhrady.
