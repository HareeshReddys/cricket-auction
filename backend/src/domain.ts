export const roles = ["Batsman", "Bowler", "All-Rounder", "Wicket Keeper"];
export type Settings = {
  banner: string;
  date: string;
  venue: string;
  fee: number;
  paymentName: string;
  paymentPhone: string;
  upi: string;
  qr: string;
  availability: string;
  terms: string;
  registrationOpen: boolean;
  liveEnabled: boolean;
  basePrice: number;
  teamBudget: number;
  archived: boolean;
};
export const defaults: Settings = {
  banner: "",
  date: "",
  venue: "",
  fee: 222,
  paymentName: "",
  paymentPhone: "",
  upi: "",
  qr: "",
  availability: "Full tournament,Partial availability",
  terms:
    "Registration fees are non-refundable. Players must follow the tournament rules and organizer instructions.",
  registrationOpen: false,
  liveEnabled: false,
  basePrice: 3000,
  teamBudget: 100000,
  archived: false,
};
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function text(value: unknown, max = 300, required = false) {
  const s = String(value ?? "").trim();
  if (s.length > max || (required && !s))
    throw new AppError(`Enter a valid value (maximum ${max} characters).`);
  return s;
}
export function amount(v: unknown, min = 0) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < min || n > 1000000000)
    throw new AppError("Enter a valid amount.");
  return n;
}
export function settingsOf(value: any): Settings {
  const s = { ...defaults, ...value };
  for (const key of [
    "date",
    "venue",
    "paymentName",
    "paymentPhone",
    "upi",
    "availability",
  ] as const)
    s[key] = text(s[key], 500);
  s.terms = text(s.terms, 6000);
  s.qr = text(s.qr, 250);
  s.banner = text(s.banner, 250);
  if (s.banner && !/^\/api\/assets\/[a-zA-Z0-9-]+$/.test(s.banner))
    throw new AppError("Upload a tournament banner first.");
  if (s.qr && !/^\/api\/assets\/[a-zA-Z0-9-]+$/.test(s.qr))
    throw new AppError("Upload a QR image first.");
  for (const key of ["fee", "basePrice", "teamBudget"] as const)
    s[key] = amount(s[key]);
  for (const key of ["registrationOpen", "liveEnabled", "archived"] as const)
    s[key] = s[key] === true;
  if (s.registrationOpen && s.fee > 0 && !s.upi && !s.paymentPhone && !s.qr)
    throw new AppError("Add payment details before opening paid registration.");
  if (s.archived) s.registrationOpen = false;
  return s;
}
export function normalizeAuction(
  teams: any[],
  state: any[],
  registrations: any[],
) {
  if (
    !Array.isArray(teams) ||
    !Array.isArray(state) ||
    teams.length > 100 ||
    state.length > 10000
  )
    throw new AppError("Invalid auction data.");
  const ids = new Set();
  const playerIds = new Set();
  const ts = teams.map((t) => {
    const id = text(t.id, 80, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id))
      throw new AppError("Invalid or duplicate team.");
    ids.add(id);
    if (!/^#[0-9a-f]{6}$/i.test(t.color))
      throw new AppError("Invalid team color.");
    return {
      id,
      name: text(t.name, 80, true),
      color: t.color,
      initialBudget: amount(t.initialBudget),
      budget: 0,
    };
  });
  const ps = state.map((p) => {
    const id = text(p.id, 80, true);
    if (playerIds.has(id)) throw new AppError("Duplicate player.");
    playerIds.add(id);
    const reg = registrations.find((r) => r.RegID === id);
    if (!reg)
      throw new AppError("Player is no longer registered. Refresh and retry.");
    if (!["pending", "sold", "unsold"].includes(p.status))
      throw new AppError("Invalid auction status.");
    if (p.status === "sold" && reg.Status !== "Verified")
      throw new AppError("Only verified players can be sold.");
    const soldTo = p.status === "sold" ? text(p.soldTo, 80, true) : null;
    if (soldTo && !ids.has(soldTo))
      throw new AppError(
        "A sold player must belong to an existing team. Reset the player before removing the team.",
      );
    const basePrice = amount(p.basePrice),
      soldPrice = p.status === "sold" ? amount(p.soldPrice) : 0;
    if (p.status === "sold" && !p.isFree && soldPrice < basePrice)
      throw new AppError("Bid is below the base price.");
    return {
      id,
      name: reg.Name,
      phone: reg.Phone,
      role: reg.PlayerType,
      cricNum: reg.CricHeroesNum,
      availability: reg.Availability,
      basePrice,
      status: p.status,
      soldTo,
      soldPrice,
      isFree: !!p.isFree,
      comment: text(p.comment, 1000),
    };
  });
  ts.forEach((t) => {
    t.budget =
      t.initialBudget -
      ps.filter((p) => p.soldTo === t.id).reduce((s, p) => s + p.soldPrice, 0);
    if (t.budget < 0) throw new AppError(`${t.name} has insufficient budget.`);
  });
  return { teams: ts, state: ps };
}
