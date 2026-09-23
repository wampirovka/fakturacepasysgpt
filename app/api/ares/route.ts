import { NextResponse } from "next/server";

const ARES_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/";

export async function GET(request: Request) {
  const ico = new URL(request.url).searchParams.get("ico")?.replace(/\D/g, "") ?? "";

  if (!/^\d{8}$/.test(ico)) {
    return NextResponse.json({ error: "IČO musí obsahovat přesně 8 číslic." }, { status: 400 });
  }

  try {
    const response = await fetch(ARES_URL + ico, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (response.status === 404) {
      return NextResponse.json({ error: "Subjekt s tímto IČO nebyl v ARES nalezen." }, { status: 404 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: "ARES je momentálně nedostupný. Údaje lze vyplnit ručně." }, { status: 502 });
    }

    const data = await response.json();
    const sidlo = data.sidlo ?? {};

    return NextResponse.json({
      ico: data.ico ?? ico,
      name: data.obchodniJmeno ?? "",
      dic: data.dic ?? "",
      street: sidlo.nazevUlice
        ? [sidlo.nazevUlice, sidlo.cisloDomovni, sidlo.cisloOrientacni ? `/${sidlo.cisloOrientacni}` : ""].filter(Boolean).join(" ")
        : "",
      city: sidlo.nazevObce ?? "",
      zip: sidlo.psc ? String(sidlo.psc).replace(/(\d{3})(\d{2})/, "$1 $2") : "",
      country: "CZ",
      addressText: sidlo.textovaAdresa ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Nepodařilo se spojit s ARES. Údaje lze vyplnit ručně." }, { status: 502 });
  }
}
