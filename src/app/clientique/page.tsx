import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clientique | Studio-Software für Beauty-Teams",
  description:
    "Clientique organisiert Kunden, Termine, Rechnungen und Team-Kalender für Beauty-Studios mit mehreren selbstständigen Behandlern.",
};

const problemItems = [
  "Jeder Behandler arbeitet mit eigenen Kunden, braucht aber trotzdem Überblick im Studio.",
  "Termine liegen verstreut in Google Kalender, WhatsApp, Papierlisten oder Notizen.",
  "Rechnungen, Kundenhistorie und Kommunikation sind nicht sauber getrennt.",
  "Admin braucht Gesamtüberblick, Behandler sollen nur ihren eigenen Bereich sehen.",
];

const solutionItems = [
  "Getrennte Kundenbereiche pro Behandler und Firma",
  "Gemeinsamer Team-Kalender mit Google-Kalender-Anbindung",
  "Rechnungen und Belege direkt aus dem Kunden- oder Terminfluss",
  "Admin-Ansicht für Studioleitung, klarer Zugriff für Behandler",
  "Kundenhistorie, Termine, Notizen und Kommunikation an einem Ort",
  "Ideal für Studios mit mehreren selbstständigen Dienstleistern",
];

const targetGroups = [
  {
    title: "Beauty-Studios",
    text: "Für Studios mit mehreren selbstständigen Behandlern unter einem Dach.",
  },
  {
    title: "Fußpflege & Kosmetik",
    text: "Für getrennte Kundenbereiche, eigene Rechnungen und gemeinsame Terminübersicht.",
  },
  {
    title: "PMU, Nails, Brows & Massage",
    text: "Für Behandler, die Google Kalender, Kundenverwaltung und Abrechnung verbinden wollen.",
  },
  {
    title: "Studio-Inhaber",
    text: "Für alle, die endlich Überblick über Termine, Kunden und Abläufe wollen.",
  },
];

const packages = [
  {
    name: "Solo",
    price: "29 €",
    subtitle: "Für Einzelbehandler",
    features: ["1 Benutzer", "Kundenverwaltung", "Termine", "Google Kalender", "Rechnungen"],
  },
  {
    name: "Studio Basic",
    price: "79 €",
    subtitle: "Für kleine Studios bis 3 Behandler",
    highlighted: true,
    features: [
      "bis 3 Benutzer",
      "getrennte Kundenbereiche",
      "Team-Kalender",
      "Rechnungen pro Behandler",
      "Basis-Support",
    ],
  },
  {
    name: "Studio Pro",
    price: "129 €",
    subtitle: "Für Studios bis 8 Behandler",
    features: [
      "bis 8 Benutzer",
      "Team-Kalender",
      "Rechnungen & Belege",
      "Warteliste",
      "Statistiken",
      "Premium-Support",
    ],
  },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        d="M16.7 5.8 8.4 14.1 3.6 9.3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.1"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path
        d="M4 10h11m0 0-4-4m4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function ClientiqueLandingPage() {
  const demoMailHref =
    "mailto:radu.craus@gmail.com?subject=Demo%20Anfrage%20Clientique&body=Hallo%20Radu,%0D%0A%0D%0Aich%20interessiere%20mich%20f%C3%BCr%20Clientique%20und%20m%C3%B6chte%20eine%20Demo%20buchen.%0D%0A%0D%0AStudio:%0D%0AAnzahl%20Behandler:%0D%0ATelefon:%0D%0A%0D%0ALiebe%20Gr%C3%BC%C3%9Fe";

  return (
    <main className="min-h-screen overflow-hidden bg-[#120f0c] text-[#f6f0e8]">
      <section className="relative isolate px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pb-24">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_14%,rgba(216,193,160,0.20),transparent_0_26%),radial-gradient(circle_at_82%_22%,rgba(168,130,92,0.16),transparent_0_24%),linear-gradient(140deg,#120f0c_0%,#1b1511_48%,#0d0a08_100%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#d8c1a0]/45 to-transparent" />

        <header className="mx-auto flex max-w-7xl items-center justify-between gap-5 rounded-full border border-white/10 bg-white/[0.035] px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:px-5">
          <a href="#top" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8c1a0]/35 bg-[#d8c1a0]/14 text-sm font-extrabold text-[#f5dfbd] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
              C
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-[0.18em] text-white/95">CLIENTIQUE</span>
              <span className="hidden text-xs text-white/45 sm:block">Studio Software</span>
            </span>
          </a>

          <nav className="hidden items-center gap-6 text-sm text-white/62 md:flex">
            <a href="#was" className="hover:text-white">Was ist es?</a>
            <a href="#zielgruppe" className="hover:text-white">Für wen?</a>
            <a href="#preise" className="hover:text-white">Preise</a>
          </nav>

          <a
            href={demoMailHref}
            className="inline-flex items-center justify-center rounded-full border border-[#d8c1a0]/25 bg-[#d8c1a0] px-4 py-2.5 text-sm font-bold text-[#17120e] shadow-[0_14px_34px_rgba(216,193,160,0.18)] hover:bg-[#ead2ad]"
          >
            Demo buchen
          </a>
        </header>

        <div id="top" className="mx-auto grid max-w-7xl gap-10 pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:pt-24">
          <div>
            <div className="inline-flex rounded-full border border-[#d8c1a0]/20 bg-[#d8c1a0]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-[#e6cfad]">
              Für Beauty-Teams mit getrennten Behandlern
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
              Kunden, Termine und Rechnungen sauber getrennt verwalten.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/68 sm:text-xl">
              Clientique ist die Studio-Software für Beauty-, Kosmetik-, Fußpflege-, PMU-, Nail- und Massage-Studios, in denen mehrere selbstständige Behandler unter einem Dach arbeiten.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href={demoMailHref}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#d8c1a0] px-6 py-4 text-sm font-extrabold text-[#17120e] shadow-[0_18px_48px_rgba(216,193,160,0.20)] hover:bg-[#ead2ad]"
              >
                Demo anfragen <ArrowIcon />
              </a>
              <a
                href="#preise"
                className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-6 py-4 text-sm font-bold text-white hover:bg-white/[0.075]"
              >
                Pakete ansehen
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/58">
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2">Google Kalender</span>
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2">Mandantenfähig</span>
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2">Rechnungen</span>
              <span className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-2">Team-Kalender</span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-[48px] bg-[#d8c1a0]/10 blur-3xl" />
            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,248,240,0.07),rgba(255,248,240,0.025))] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.40)] backdrop-blur-2xl">
              <div className="rounded-[28px] border border-white/8 bg-[#100d0a]/72 p-5">
                <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/38">Heute im Studio</p>
                    <h2 className="mt-1 text-xl font-bold text-white">Team-Kalender</h2>
                  </div>
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">Live</div>
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    ["09:00", "Fußpflege", "Raluca", "#a855f7"],
                    ["10:30", "Permanent Make-up", "Radu", "#3b82f6"],
                    ["12:00", "Kosmetik", "Barbara", "#f97316"],
                    ["14:15", "Nails", "Alexandra", "#22c55e"],
                  ].map(([time, service, name, color]) => (
                    <div key={`${time}-${name}`} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-white">{service}</div>
                        <div className="mt-0.5 text-xs text-white/45">{name} · Kundenname sichtbar</div>
                      </div>
                      <div className="text-sm font-bold text-[#d8c1a0]">{time}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    ["32", "Kunden"],
                    ["8", "Termine"],
                    ["4", "Behandler"],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-white/8 bg-black/20 p-4 text-center">
                      <div className="text-2xl font-extrabold text-white">{value}</div>
                      <div className="mt-1 text-xs text-white/42">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="was" className="px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d8c1a0]">Was ist Clientique?</p>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Eine klare Software für den Studio-Alltag.</h2>
            </div>
            <div className="rounded-[30px] border border-white/8 bg-white/[0.035] p-6 text-lg leading-8 text-white/68 shadow-[0_20px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:p-8">
              Clientique hilft Studios dabei, Kunden, Termine, Rechnungen und Behandler sauber zu organisieren. Besonders stark ist es, wenn mehrere selbstständige Dienstleister im selben Studio arbeiten: alle nutzen einen gemeinsamen Überblick, aber jeder Bereich bleibt sauber getrennt.
            </div>
          </div>
        </div>
      </section>

      <section id="zielgruppe" className="px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d8c1a0]">Für wen?</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Gebaut für Studios, die gemeinsam arbeiten – aber getrennt abrechnen.</h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {targetGroups.map((item) => (
              <article key={item.title} className="rounded-[28px] border border-white/8 bg-white/[0.035] p-6 shadow-[0_18px_55px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
                <h3 className="text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/58">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
          <div className="rounded-[32px] border border-red-300/10 bg-red-300/[0.035] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-200/70">Das Problem</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">Schluss mit Excel, WhatsApp-Chaos und Papierlisten.</h2>
            <div className="mt-7 space-y-4">
              {problemItems.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-white/62">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-200/65" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[32px] border border-[#d8c1a0]/14 bg-[#d8c1a0]/[0.055] p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d8c1a0]">Die Lösung</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">Alles an einem Ort, aber sauber nach Behandler getrennt.</h2>
            <div className="mt-7 grid gap-4">
              {solutionItems.map((item) => (
                <div key={item} className="flex gap-3 text-sm leading-6 text-white/70">
                  <span className="mt-1 text-[#d8c1a0]"><CheckIcon /></span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="preise" className="px-5 py-16 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d8c1a0]">Pakete & Preise</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Einfach starten. Später wachsen.</h2>
            <p className="mt-5 text-base leading-7 text-white/58">Alle Pakete sind monatlich gedacht. Einrichtung und Datenübernahme werden separat vereinbart.</p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {packages.map((pkg) => (
              <article
                key={pkg.name}
                className={`relative rounded-[32px] border p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl sm:p-8 ${
                  pkg.highlighted
                    ? "border-[#d8c1a0]/32 bg-[#d8c1a0]/[0.075]"
                    : "border-white/8 bg-white/[0.035]"
                }`}
              >
                {pkg.highlighted ? (
                  <div className="absolute right-5 top-5 rounded-full bg-[#d8c1a0] px-3 py-1 text-xs font-extrabold text-[#17120e]">Beliebt</div>
                ) : null}
                <h3 className="text-2xl font-bold text-white">{pkg.name}</h3>
                <p className="mt-2 text-sm text-white/50">{pkg.subtitle}</p>
                <div className="mt-7 flex items-end gap-2">
                  <span className="text-5xl font-extrabold tracking-[-0.06em] text-white">{pkg.price}</span>
                  <span className="pb-2 text-sm text-white/45">/ Monat</span>
                </div>
                <div className="mt-7 h-px bg-white/8" />
                <div className="mt-7 space-y-4">
                  {pkg.features.map((feature) => (
                    <div key={feature} className="flex gap-3 text-sm text-white/68">
                      <span className="text-[#d8c1a0]"><CheckIcon /></span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-[26px] border border-white/8 bg-white/[0.035] px-6 py-5 text-center text-sm text-white/62">
            Einrichtung ab <span className="font-bold text-white">299 € einmalig</span>. Enthalten je nach Paket: Studio anlegen, Benutzer einrichten, Kalender verbinden, Services importieren und kurze Einschulung.
          </div>
        </div>
      </section>

      <section id="demo" className="px-5 pb-20 pt-10 sm:px-8 lg:px-10 lg:pb-28">
        <div className="mx-auto max-w-5xl rounded-[36px] border border-[#d8c1a0]/18 bg-[linear-gradient(180deg,rgba(216,193,160,0.13),rgba(255,248,240,0.035))] p-7 text-center shadow-[0_30px_90px_rgba(0,0,0,0.32)] backdrop-blur-2xl sm:p-10 lg:p-14">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d8c1a0]">Demo buchen</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">Möchtest du sehen, ob Clientique zu deinem Studio passt?</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/62">
            Buche eine kostenlose 15-Minuten-Demo. Wir schauen gemeinsam, wie viele Behandler ihr habt, wie ihr Termine organisiert und ob Clientique euren Alltag wirklich einfacher macht.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={demoMailHref}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#d8c1a0] px-7 py-4 text-sm font-extrabold text-[#17120e] hover:bg-[#ead2ad]"
            >
              Demo per E-Mail anfragen <ArrowIcon />
            </a>
            <a
              href="tel:+436766742429"
              className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.045] px-7 py-4 text-sm font-bold text-white hover:bg-white/[0.075]"
            >
              Direkt anrufen
            </a>
          </div>
          <p className="mt-5 text-xs text-white/38">Antwort normalerweise persönlich durch Radu. Keine automatische Massenabwicklung.</p>
        </div>
      </section>
    </main>
  );
}
