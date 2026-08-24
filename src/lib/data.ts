// ---------------------------------------------------------------------------
// Simulated read-only view of the existing Milk Producers Management System
// (members + milk_entries + advances). Deterministic per-date generator so
// every "database fetch" is stable. Nothing here ever mutates source records.
// ---------------------------------------------------------------------------

export type Shift = "AM" | "PM";
export type MsgStatus = "pending" | "opened" | "sent" | "failed" | "skipped";

export interface Producer {
  id: number;
  code: string;
  name: string;
  phone: string; // 10-digit, no country code
  village: string;
  animal: "Buffalo" | "Cow" | "Mixed";
  joined: string;
}

export interface Collection {
  id: string; // `${date}|${producerId}|${shift}` — unique per entry
  producerId: number;
  date: string; // YYYY-MM-DD
  shift: Shift;
  milkLtr: number;
  fat: number;
  snf: number;
  rate: number; // ₹ per litre, FAT/SNF based
  amount: number; // milkLtr × rate
  advance: number; // advance deduction for the day
  net: number; // amount − advance
}

export const PRODUCERS: Producer[] = [
  { id: 1, code: "MP-001", name: "Ravi Patel", phone: "9825014367", village: "Anand", animal: "Buffalo", joined: "2019-04-12" },
  { id: 2, code: "MP-002", name: "Suresh Yadav", phone: "9974123580", village: "Vallabh Vidyanagar", animal: "Mixed", joined: "2018-11-02" },
  { id: 3, code: "MP-003", name: "Mahesh Chauhan", phone: "9898337421", village: "Karamsad", animal: "Buffalo", joined: "2020-01-19" },
  { id: 4, code: "MP-004", name: "Dinesh Solanki", phone: "9723486015", village: "Bakrol", animal: "Cow", joined: "2017-06-30" },
  { id: 5, code: "MP-005", name: "Kiran Rathod", phone: "9879552301", village: "Anand", animal: "Buffalo", joined: "2021-02-08" },
  { id: 6, code: "MP-006", name: "Bhavna Prajapati", phone: "9909412876", village: "Vithal Udyognagar", animal: "Mixed", joined: "2019-09-23" },
  { id: 7, code: "MP-007", name: "Arjun Thakor", phone: "9824771930", village: "Mogra", animal: "Cow", joined: "2016-12-05" },
  { id: 8, code: "MP-008", name: "Nilesh Parmar", phone: "9714208456", village: "Karamsad", animal: "Buffalo", joined: "2020-07-14" },
  { id: 9, code: "MP-009", name: "Sunita Devi", phone: "9898045712", village: "Anand", animal: "Mixed", joined: "2018-03-27" },
  { id: 10, code: "MP-010", name: "Rajesh Makwana", phone: "9925683140", village: "Bakrol", animal: "Buffalo", joined: "2015-08-11" },
  { id: 11, code: "MP-011", name: "Pooja Chaudhary", phone: "9879910243", village: "Vallabh Vidyanagar", animal: "Cow", joined: "2022-01-17" },
  { id: 12, code: "MP-012", name: "Manoj Vaghela", phone: "9727554809", village: "Mogra", animal: "Buffalo", joined: "2019-05-09" },
  { id: 13, code: "MP-013", name: "Hitesh Rana", phone: "9913207645", village: "Anand", animal: "Mixed", joined: "2017-10-21" },
  { id: 14, code: "MP-014", name: "Geeta Barot", phone: "9825936174", village: "Karamsad", animal: "Buffalo", joined: "2020-12-03" },
  { id: 15, code: "MP-015", name: "Vipul Desai", phone: "9769348250", village: "Vithal Udyognagar", animal: "Cow", joined: "2018-07-16" },
  { id: 16, code: "MP-016", name: "Sanjay Dabhi", phone: "9978401523", village: "Bakrol", animal: "Buffalo", joined: "2016-02-28" },
  { id: 17, code: "MP-017", name: "Meena Koli", phone: "9898672034", village: "Mogra", animal: "Mixed", joined: "2021-06-11" },
  { id: 18, code: "MP-018", name: "Ashok Chauhan", phone: "9714985360", village: "Anand", animal: "Buffalo", joined: "2014-09-04" },
  { id: 19, code: "MP-019", name: "Rakesh Mori", phone: "9924817905", village: "Vallabh Vidyanagar", animal: "Cow", joined: "2019-12-25" },
  { id: 20, code: "MP-020", name: "Lata Jadeja", phone: "9825349687", village: "Karamsad", animal: "Buffalo", joined: "2020-04-30" },
  { id: 21, code: "MP-021", name: "Prakash Zala", phone: "9769024813", village: "Anand", animal: "Mixed", joined: "2017-01-22" },
  { id: 22, code: "MP-022", name: "Nimesh Gohil", phone: "9909756128", village: "Mogra", animal: "Buffalo", joined: "2018-08-19" },
  { id: 23, code: "MP-023", name: "Falguni Sethi", phone: "9879160342", village: "Bakrol", animal: "Cow", joined: "2022-05-06" },
  { id: 24, code: "MP-024", name: "Bharat Chavda", phone: "9723901478", village: "Vithal Udyognagar", animal: "Buffalo", joined: "2015-03-13" },
  { id: 25, code: "MP-025", name: " Rekha Rathwa", phone: "9924538016", village: "Anand", animal: "Mixed", joined: "2021-10-09" },
  { id: 26, code: "MP-026", name: "Jayesh Bhatt", phone: "9898102749", village: "Karamsad", animal: "Buffalo", joined: "2016-06-18" },
];

export const producerById = new Map(PRODUCERS.map((p) => [p.id, p]));

// --- deterministic PRNG ----------------------------------------------------
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

// --- daily collection read (members ⋈ milk_entries ⋈ advances) -------------
const collectionCache = new Map<string, Collection[]>();

export function getCollections(date: string): Collection[] {
  const hit = collectionCache.get(date);
  if (hit) return hit;

  const rows: Collection[] = [];
  for (const p of PRODUCERS) {
    const rng = mulberry32(hashStr(`${date}::${p.code}`));
    if (rng() < 0.09) continue; // producer absent that day

    const buffalo = p.animal === "Buffalo";
    const bothShifts = rng() < 0.62;
    const shifts: Shift[] = bothShifts ? ["AM", "PM"] : rng() < 0.5 ? ["AM"] : ["PM"];
    // a daily advance deduction recorded against ~22% of producers
    const advance = rng() < 0.22 ? Math.round((100 + rng() * 700) / 10) * 10 : 0;

    shifts.forEach((shift, si) => {
      const base = buffalo ? 7 + rng() * 11 : 3.5 + rng() * 7.5;
      const milkLtr = r1(Math.max(1.5, base * (si === 1 ? 0.82 : 1)));
      const fat = r1(buffalo ? 5.6 + rng() * 2.6 : 3.4 + rng() * 1.6);
      const snf = r1(8.1 + rng() * 1.3);
      const rate = r2(fat * 6.4 + snf * 3.2 + 4.5);
      const amount = r2(milkLtr * rate);
      const advShare = bothShifts && si === 0 ? advance : bothShifts ? 0 : advance;
      const adv = Math.min(advShare, Math.floor(amount)); // never over-deduct
      rows.push({
        id: `${date}|${p.id}|${shift}`,
        producerId: p.id,
        date,
        shift,
        milkLtr,
        fat,
        snf,
        rate,
        amount,
        advance: adv,
        net: r2(amount - adv),
      });
    });
  }
  collectionCache.set(date, rows);
  return rows;
}

export function lastNDates(n: number, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${end}T12:00:00`);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    out.push(toISO(x));
  }
  return out;
}

export function toISO(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export const DEFAULT_TEMPLATE = `Hello {producer_name},

Today's Milk Collection

Date: {date}
Shift: {shift}
Milk: {milk_ltr} Ltr
FAT: {fat}
SNF: {snf}
Rate: ₹{rate_per_ltr}/Ltr

Milk Amount: ₹{milk_amount}
Advance Deduction: ₹{advance_deduction}
Net Payable: ₹{net_payable}

Thank you.

Milk Producers Management System`;

export const TEMPLATE_VARS = [
  "{producer_name}",
  "{producer_id}",
  "{date}",
  "{shift}",
  "{milk_ltr}",
  "{fat}",
  "{snf}",
  "{rate_per_ltr}",
  "{milk_amount}",
  "{advance_deduction}",
  "{net_payable}",
] as const;
