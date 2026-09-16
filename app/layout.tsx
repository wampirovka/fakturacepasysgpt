import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fakturace",
  description: "Jednoduchá webová aplikace pro fakturaci a evidenci úhrad.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
