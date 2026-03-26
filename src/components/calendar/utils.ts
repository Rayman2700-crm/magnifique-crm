import type { Item, Positioned } from "@/components/calendar/types";

export function pad2(n: number) {
      return String(n).padStart(2, "0");
}

export function toLocalISODate(d: Date) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number) {
      const d = new Date(`${iso}T12:00:00`);
      d.setDate(d.getDate() + days);
      return toLocalISODate(d);
}

export function addMonthsISO(iso: string, months: number) {
      const d = new Date(`${iso}T12:00:00`);
      d.setMonth(d.getMonth() + months);
      return toLocalISODate(d);
}

export function addYearsISO(iso: string, years: number) {
      const d = new Date(`${iso}T12:00:00`);
      d.setFullYear(d.getFullYear() + years);
      return toLocalISODate(d);
}

export function startOfWeekMondayISOFromAnchor(anchorISO: string) {
      const d = new Date(`${anchorISO}T12:00:00`);
      d.setHours(0, 0, 0, 0);
      const day = d.getDay(); // 0=So..6=Sa
      const diff = (day + 6) % 7; // Mo=0
      d.setDate(d.getDate() - diff);
      return toLocalISODate(d);
}

export function startOfMonthISO(anchorISO: string) {
      const d = new Date(`${anchorISO}T12:00:00`);
      d.setDate(1);
      return toLocalISODate(d);
}

export function startOfYearISO(anchorISO: string) {
      const d = new Date(`${anchorISO}T12:00:00`);
      d.setMonth(0, 1);
      return toLocalISODate(d);
}

export function fmtTime(d: Date) {
      return new Intl.DateTimeFormat("de-AT", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtDayHeader(d: Date) {
      const dow = new Intl.DateTimeFormat("de-AT", { weekday: "short" }).format(d);
      return { dow, day: d.getDate() };
}

export function fmtMonthYear(anchorISO: string) {
      const d = new Date(`${anchorISO}T12:00:00`);
      return new Intl.DateTimeFormat("de-AT", { month: "long", year: "numeric" }).format(d);
}

export function fmtYear(anchorISO: string) {
      const d = new Date(`${anchorISO}T12:00:00`);
      return String(d.getFullYear());
}

export function isoWeekNumber(d: Date) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function tenantTheme(tenantName: string) {
      const n = (tenantName || "").toLowerCase();

      let bg = "rgba(255,255,255,0.06)";
      let text = "rgba(255,255,255,0.92)";
      let subText = "rgba(255,255,255,0.75)";

      if (n.includes("radu")) {
            bg = "#6366F1";
            text = "#ffffff";
            subText = "rgba(255,255,255,0.82)";
      } else if (n.includes("raluca")) {
            bg = "#7B1FA2";
            text = "#ffffff";
            subText = "rgba(255,255,255,0.82)";
      } else if (n.includes("alexandra")) {
            bg = "#0A8F08";
            text = "#ffffff";
            subText = "rgba(255,255,255,0.82)";
      } else if (n.includes("barbara")) {
            bg = "#F57C00";
            text = "#0b0b0c";
            subText = "rgba(11,11,12,0.72)";
      }

      return { bg, text, subText };
}

export function normalizePhoneForTel(phone: string) {
      return phone.trim().replace(/[^\d+]/g, "");
}

export function normalizePhoneForWhatsApp(phone: string) {
      let digits = phone.trim().replace(/\D/g, "");

      if (!digits) return "";

      // 0043... -> 43...
      if (digits.startsWith("00")) {
            digits = digits.slice(2);
      }

      // +43... wird oben bereits zu 43...
      if (digits.startsWith("43")) {
            return digits;
      }

      // Österreichische lokale Nummern wie 0664..., 0676..., 0680...
      if (digits.startsWith("0")) {
            return `43${digits.slice(1)}`;
      }

      return digits;
}

export function buildWhatsAppText(it: Item) {
      const name = it.customerName ?? "";
      const start = new Date(it.start_at);
      const day = new Intl.DateTimeFormat("de-AT", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
      }).format(start);
      const time = fmtTime(start);
      const service = it.title ? ` (${it.title})` : "";
      return `Hallo ${name}, hier ist Magnifique Beauty Institut. Kurze Erinnerung: Dein Termin am ${day} um ${time}${service}.`;
}

function getReminderDateLabel(start: Date) {
      const appointmentDay = new Date(start);
      appointmentDay.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffDays = Math.round((appointmentDay.getTime() - today.getTime()) / 86400000);

      if (diffDays === 0) return "heute";
      if (diffDays === 1) return "morgen";

      return `am ${new Intl.DateTimeFormat("de-AT", {
            weekday: "long",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
      }).format(start)}`;
}

export function buildReminderText(it: Item) {
      const name = it.customerName?.trim() || "";
      const start = new Date(it.start_at);
      const when = getReminderDateLabel(start);
      const time = fmtTime(start);
      const therapist = it.tenantName?.trim() || "unserem Team";
      const title = it.title?.trim() || "deine Behandlung";

      return `Hallo ${name}, kurze Erinnerung an deinen Termin ${when} um ${time} Uhr bei ${therapist} für ${title} im Magnifique Beauty Institut.`.replace(/\s+/g, " ").trim();
}

export function buildReminderWhatsAppUrl(it: Item) {
      if (!it.customerPhone) return undefined;
      return `https://wa.me/${normalizePhoneForWhatsApp(it.customerPhone)}?text=${encodeURIComponent(buildReminderText(it))}`;
}

export function layoutDay(items: Item[], dayISO: string, startHour: number, pxPerMin: number) {
      const events = items
            .filter((it) => it.start_at.slice(0, 10) === dayISO)
            .slice()
            .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

      type Active = { end: number; col: number };
      const active: Active[] = [];
      const usedCols: number[] = [];
      const placed: Positioned[] = [];

      const minsFromStartHour = (d: Date) => d.getHours() * 60 + d.getMinutes() - startHour * 60;

      for (const it of events) {
            const s = new Date(it.start_at);
            const e = new Date(it.end_at);

            const sMin = minsFromStartHour(s);
            const eMin = Math.max(sMin + 10, minsFromStartHour(e));

            const nowMs = s.getTime();
            for (let i = active.length - 1; i >= 0; i--) {
                  const a = active[i];
                  if (a.end <= nowMs) {
                        usedCols.push(a.col);
                        active.splice(i, 1);
                  }
            }

            usedCols.sort((a, b) => a - b);
            const col = usedCols.length > 0 ? usedCols.shift()! : active.length;

            active.push({ end: e.getTime(), col });
            active.sort((a, b) => a.end - b.end);

            const top = Math.max(0, sMin) * pxPerMin;
            const height = Math.max(18, (eMin - Math.max(0, sMin)) * pxPerMin);

            placed.push({
                  ...it,
                  _dayISO: dayISO,
                  _top: top,
                  _height: height,
                  _col: col,
                  _cols: 1,
                  _timeLine: `${fmtTime(s)}–${fmtTime(e)}`,
                  _customer: it.customerName ?? "Unbekannter Kunde",
            });
      }

      for (const ev of placed) {
            const s1 = new Date(ev.start_at).getTime();
            const e1 = new Date(ev.end_at).getTime();
            let maxCol = 0;
            for (const other of placed) {
                  const s2 = new Date(other.start_at).getTime();
                  const e2 = new Date(other.end_at).getTime();
                  const overlap = s1 < e2 && s2 < e1;
                  if (overlap) maxCol = Math.max(maxCol, other._col);
            }
            ev._cols = maxCol + 1;
      }

      return placed;
}

export function buildMonthGrid(anchorISO: string) {
      const start = new Date(`${startOfMonthISO(anchorISO)}T12:00:00`);
      const firstDow = (start.getDay() + 6) % 7; // Mo=0
      const gridStart = new Date(start);
      gridStart.setDate(gridStart.getDate() - firstDow);

      const cells: { iso: string; inMonth: boolean; date: Date }[] = [];
      const month = start.getMonth();

      for (let i = 0; i < 42; i++) {
            const d = new Date(gridStart);
            d.setDate(gridStart.getDate() + i);
            cells.push({ iso: toLocalISODate(d), inMonth: d.getMonth() === month, date: d });
      }

      return cells;
}

export function buildYearMonths(anchorISO: string) {
      const yStart = new Date(`${startOfYearISO(anchorISO)}T12:00:00`);
      const out: { label: string; iso: string }[] = [];
      for (let m = 0; m < 12; m++) {
            const d = new Date(yStart);
            d.setMonth(m, 1);
            out.push({
                  label: new Intl.DateTimeFormat("de-AT", { month: "long" }).format(d),
                  iso: toLocalISODate(d),
            });
      }
      return out;
}