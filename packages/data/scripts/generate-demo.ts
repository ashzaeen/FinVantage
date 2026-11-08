/**
 * Generates the demo profile, fixtures/planner.json: about eleven months of a realistic, steady
 * financial life for one person, in Plaid's format. Deterministic: the same seed and end date
 * always give the same file.
 *
 *   npm run generate:demo -w @finvantage/data                      ends today
 *   npm run generate:demo -w @finvantage/data -- --as-of 2026-11-08
 *
 * The persona: Jordan Rivera, a product designer who owns a condo. Take-home pay of about $5,700
 * a month on the 1st and 15th, a little freelance work, about $4,100 of monthly spending with
 * seasonal swings (winter and summer utilities, December holidays, a July trip), three credit
 * cards paid in full or on plan, retirement and brokerage investing, and four goals that are
 * mostly on track. Balances, balance history, holdings, and streams all agree with each other.
 *
 * After regenerating: restart the API (memory store), and reseed production with
 * `npm run seed:maincloud -w @finvantage/spacetime` or POST /v1/profile/load-demo as the demo user.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---------- Settings ----------

const args = process.argv.slice(2);
const asOfArg = args[args.indexOf("--as-of") + 1];
const AS_OF = args.includes("--as-of") && asOfArg ? asOfArg : new Date().toISOString().slice(0, 10);
const MONTHS = 11;
const SEED = 20261108;

// ---------- Helpers ----------

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const random = rng(SEED);
const between = (lo: number, hi: number) => lo + random() * (hi - lo);
const money = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function monthStart(iso: string, offset: number) {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 10);
}
function daysInMonth(start: string) {
  const d = new Date(`${start}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}
const day = (start: string, n: number) => `${start.slice(0, 8)}${String(Math.min(n, daysInMonth(start))).padStart(2, "0")}`;
const monthNum = (iso: string) => Number(iso.slice(5, 7));

// ---------- Accounts (today's balances) ----------

const ACCOUNTS = {
  checking: { id: "acc_checking", name: "Everyday Checking", type: "depository", subtype: "checking", mask: "4421" },
  savings: { id: "acc_savings", name: "High-Yield Savings", type: "depository", subtype: "savings", mask: "7710" },
  cd: { id: "acc_cd", name: "12-Month CD", type: "depository", subtype: "cd", mask: "3392" },
  auto: { id: "acc_auto", name: "Auto Loan", type: "loan", subtype: "auto", mask: "5520" },
  personal: { id: "acc_personal", name: "Personal Loan", type: "loan", subtype: "consumer", mask: "6604" },
  cashCard: { id: "acc_card", name: "Cash Rewards Card", type: "credit", subtype: "credit card", mask: "3005" },
  travelCard: { id: "acc_travel_card", name: "Travel Rewards Card", type: "credit", subtype: "credit card", mask: "9182" },
  promo: { id: "acc_promo", name: "0% Promo Card", type: "credit", subtype: "credit card", mask: "2276" },
  mortgage: { id: "acc_mortgage", name: "Condo Mortgage", type: "loan", subtype: "mortgage", mask: "0418" },
  ira: { id: "acc_ira", name: "Roth IRA", type: "investment", subtype: "roth", mask: "8801" },
  k401: { id: "acc_401k", name: "401(k)", type: "investment", subtype: "401k", mask: "1150" },
  brokerage: { id: "acc_brokerage", name: "Brokerage", type: "investment", subtype: "brokerage", mask: "6230" },
} as const;

/** Monthly fixed amounts, in dollars. */
const PAYCHECK = 2850;
/** Principal, interest, and escrow for property tax, insurance, and the condo HOA. */
const MORTGAGE_PAYMENT = 1320;
const AUTO_PAYMENT = 389;
const PERSONAL_PAYMENT = 150;
const INSURANCE = 118;
const SAVINGS_TRANSFER = 1400;
const ROTH_TRANSFER = 500;
const BROKERAGE_TRANSFER = 400;
const PROMO_PLAN = 200;

/** Today's balances in dollars. History is worked backwards from these. */
const TODAY_BALANCE = {
  /** The Copilot checkout demo (PRD section 6) needs a $1,499 laptop to dip this under the $2,500 cushion. */
  checking: 3400,
  savings: 18500,
  cd: 10000,
  auto: 14600,
  personal: 2400,
  cashCard: 0, // set from this cycle's purchases
  travelCard: 0, // set from this cycle's purchases
  promo: 1800,
  mortgage: 96500,
};
const LIMITS = { cashCard: 8000, travelCard: 12000, promo: 6000 };

// ---------- Transactions ----------

interface Txn {
  transaction_id: string;
  account_id: string;
  amount: number;
  date: string;
  name: string;
  merchant: string;
  category: [string, string];
  channel: "online" | "in store" | "other";
  stream?: string;
}

const txns: Txn[] = [];
let seq = 0;
function add(date: string, account: string, amount: number, merchant: string, category: [string, string], channel: Txn["channel"] = "in store", stream?: string) {
  if (date > AS_OF) return;
  seq += 1;
  txns.push({
    transaction_id: `txn_${date.replaceAll("-", "")}_${String(seq).padStart(4, "0")}`,
    account_id: account,
    amount: money(amount),
    date,
    name: merchant.toUpperCase(),
    merchant,
    category,
    channel,
    stream,
  });
}

const C = {
  paycheck: ["INCOME", "INCOME_WAGES"],
  freelance: ["INCOME", "INCOME_CONTRACTOR"],
  interest: ["INCOME", "INCOME_INTEREST_EARNED"],
  dividends: ["INCOME", "INCOME_DIVIDENDS"],
  taxRefund: ["INCOME", "INCOME_TAX_REFUND"],
  mortgage: ["LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT"],
  car: ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT"],
  personalLoan: ["LOAN_PAYMENTS", "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT"],
  cardPayment: ["LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"],
  electric: ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY"],
  water: ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_WATER"],
  internet: ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE"],
  phone: ["RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE"],
  insurance: ["GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE"],
  groceries: ["FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"],
  restaurant: ["FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT"],
  coffee: ["FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"],
  fastFood: ["FOOD_AND_DRINK", "FOOD_AND_DRINK_FAST_FOOD"],
  gas: ["TRANSPORTATION", "TRANSPORTATION_GAS"],
  parking: ["TRANSPORTATION", "TRANSPORTATION_PARKING"],
  rideshare: ["TRANSPORTATION", "TRANSPORTATION_TAXIS_AND_RIDE_SHARES"],
  carService: ["GENERAL_SERVICES", "GENERAL_SERVICES_AUTOMOTIVE"],
  streaming: ["ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"],
  music: ["ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO"],
  events: ["ENTERTAINMENT", "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS"],
  gym: ["PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"],
  hair: ["PERSONAL_CARE", "PERSONAL_CARE_HAIR_AND_BEAUTY"],
  online: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"],
  clothing: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES"],
  superstore: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_SUPERSTORES"],
  electronics: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ELECTRONICS"],
  gifts: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES"],
  books: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS"],
  pets: ["GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_PET_SUPPLIES"],
  vet: ["MEDICAL", "MEDICAL_VETERINARY_SERVICES"],
  hardware: ["HOME_IMPROVEMENT", "HOME_IMPROVEMENT_HARDWARE"],
  pharmacy: ["MEDICAL", "MEDICAL_PHARMACIES_AND_SUPPLEMENTS"],
  doctor: ["MEDICAL", "MEDICAL_PRIMARY_CARE"],
  dental: ["MEDICAL", "MEDICAL_DENTAL_CARE"],
  flights: ["TRAVEL", "TRAVEL_FLIGHTS"],
  lodging: ["TRAVEL", "TRAVEL_LODGING"],
  donation: ["GOVERNMENT_AND_NON_PROFIT", "GOVERNMENT_AND_NON_PROFIT_DONATIONS"],
  toSavings: ["TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"],
  toInvest: ["TRANSFER_OUT", "TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS"],
  transferIn: ["TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER"],
} as const satisfies Record<string, readonly [string, string]>;
const cat = (c: readonly [string, string]): [string, string] => [c[0], c[1]];

const A = ACCOUNTS;
const firstMonth = monthStart(AS_OF, -(MONTHS - 1));
const months = Array.from({ length: MONTHS }, (_, i) => monthStart(firstMonth, i));
/** Purchases on each card per month, for card payments and today's balances. */
const cardSpend = new Map<string, number>();
const spendOn = (card: string, month: string, amount: number) => cardSpend.set(`${card}:${month}`, (cardSpend.get(`${card}:${month}`) ?? 0) + amount);

for (const [index, m] of months.entries()) {
  const mm = monthNum(m);
  const isCurrent = index === months.length - 1;
  const card = (date: string, account: string, amount: number, merchant: string, c: readonly [string, string], channel: Txn["channel"] = "in store") => {
    if (date > AS_OF) return;
    add(date, account, amount, merchant, cat(c), channel);
    spendOn(account, m, amount);
  };

  // Income: semi-monthly pay, interest, quarterly dividends, occasional freelance, an April refund.
  add(day(m, 1), A.checking.id, -PAYCHECK, "Northwind Design Co", cat(C.paycheck), "online", "stream_payroll");
  add(day(m, 15), A.checking.id, -PAYCHECK, "Northwind Design Co", cat(C.paycheck), "online", "stream_payroll");
  add(day(m, 28), A.savings.id, -money(between(52, 58) * (1 + index * 0.015)), "High-Yield Savings Interest", cat(C.interest), "other");
  if ([3, 6, 9, 12].includes(mm)) add(day(m, 27), A.brokerage.id, -money(between(38, 52)), "Brokerage Dividends", cat(C.dividends), "other");
  if ([1, 4, 6, 9].includes(mm)) add(day(m, 20), A.checking.id, -pick([450, 600, 750, 900]), "Freelance Client Payment", cat(C.freelance), "online");
  if (mm === 4) add(day(m, 18), A.checking.id, -1240, "IRS Treasury Tax Refund", cat(C.taxRefund), "online");

  // Housing and bills, from checking. Bills fall mid to late month.
  add(day(m, 1), A.checking.id, MORTGAGE_PAYMENT, "Lakeside Home Loans", cat(C.mortgage), "online", "stream_mortgage");
  add(day(m, 5), A.checking.id, AUTO_PAYMENT, "Summit Auto Finance", cat(C.car), "online", "stream_auto");
  add(day(m, 10), A.checking.id, PERSONAL_PAYMENT, "Harbor Personal Lending", cat(C.personalLoan), "online", "stream_personal");
  add(day(m, 12), A.checking.id, INSURANCE, "Keystone Auto Insurance", cat(C.insurance), "online", "stream_insurance");
  const seasonal = [12, 1, 2].includes(mm) ? 1.45 : [7, 8].includes(mm) ? 1.35 : [6, 9].includes(mm) ? 1.1 : 0.9;
  add(day(m, 18), A.checking.id, money(between(88, 102) * seasonal), "City Power & Light", cat(C.electric), "online", "stream_power");
  add(day(m, 20), A.checking.id, money(between(41, 49)), "Metro Water Utility", cat(C.water), "online", "stream_water");
  add(day(m, 22), A.checking.id, 70, "Fiberlink Internet", cat(C.internet), "online", "stream_internet");
  add(day(m, 24), A.checking.id, 65, "Bluewave Mobile", cat(C.phone), "online", "stream_phone");

  // Moving money: savings and the Roth IRA, both sides of each transfer.
  add(day(m, 16), A.checking.id, SAVINGS_TRANSFER, "Transfer to High-Yield Savings", cat(C.toSavings), "online", "stream_savings");
  add(day(m, 16), A.savings.id, -SAVINGS_TRANSFER, "Transfer from Everyday Checking", cat(C.transferIn), "online");
  add(day(m, 17), A.checking.id, ROTH_TRANSFER, "Roth IRA Contribution", cat(C.toInvest), "online", "stream_roth");
  add(day(m, 17), A.ira.id, -ROTH_TRANSFER, "Contribution from Everyday Checking", cat(C.transferIn), "online");
  add(day(m, 18), A.checking.id, BROKERAGE_TRANSFER, "Brokerage Deposit", cat(C.toInvest), "online", "stream_brokerage");
  add(day(m, 18), A.brokerage.id, -BROKERAGE_TRANSFER, "Deposit from Everyday Checking", cat(C.transferIn), "online");

  // Subscriptions on the travel card.
  card(day(m, 3), A.travelCard.id, 15.49, "StreamFlix", C.streaming, "online");
  card(day(m, 6), A.travelCard.id, 10.99, "Tunewave", C.music, "online");
  card(day(m, 8), A.travelCard.id, 8.99, "Daily Ledger News", C.books, "online");
  card(day(m, 4), A.cashCard.id, 45, "Peak Fitness", C.gym);

  // Everyday spending on the cash-back card. The current month only runs to today.
  const groceryDays = isCurrent ? [4] : [3, 10, 17, 24, 30].slice(0, pick([4, 4, 5]));
  for (const d of groceryDays) card(day(m, d), A.cashCard.id, between(96, 152), pick(["Green Grocer", "Fresh Market", "Green Grocer"]), C.groceries);
  if (!isCurrent || index % 2 === 0) card(day(m, 13), A.cashCard.id, between(30, 55), "Costwise Warehouse", C.superstore);
  const dining = isCurrent ? [2, 7] : [2, 7, 12, 19, 23, 27].slice(0, pick([5, 5, 6]));
  for (const d of dining) card(day(m, d), A.cashCard.id, between(16, 58), pick(["Taqueria Norte", "Basil & Vine", "The Noodle Bar", "Harbor Grill", "Sunrise Diner"]), C.restaurant);
  for (const d of isCurrent ? [5] : [6, 21]) card(day(m, d), A.cashCard.id, between(4.5, 7.5), "Bean There Coffee", C.coffee);
  if (!isCurrent) card(day(m, 25), A.cashCard.id, between(9, 15), "Quick Bite", C.fastFood);
  for (const d of isCurrent ? [6] : [7, 16, 26]) card(day(m, d), A.cashCard.id, between(38, 52), "Fuel Stop", C.gas);
  if (!isCurrent && index % 3 === 1) card(day(m, 19), A.cashCard.id, between(14, 26), "Ride Share", C.rideshare, "online");
  if (!isCurrent) card(day(m, 11), A.cashCard.id, between(22, 68), "Shopwise", C.online, "online");
  if (!isCurrent) card(day(m, 23), A.cashCard.id, between(28, 74), "Shopwise", C.online, "online");
  if (!isCurrent && index % 2 === 0) card(day(m, 21), A.cashCard.id, between(35, 90), pick(["Threadline Apparel", "Corner Books"]), index % 4 === 0 ? C.books : C.clothing);
  if (!isCurrent) card(day(m, 9), A.cashCard.id, between(32, 48), "Pawsome Pet Supply", C.pets);
  if (!isCurrent && index % 2 === 1) card(day(m, 15), A.cashCard.id, between(42, 60), "Studio Cuts", C.hair);
  if (!isCurrent && index % 3 === 0) card(day(m, 20), A.cashCard.id, between(12, 28), "Neighborhood Pharmacy", C.pharmacy);
  if (!isCurrent && index % 3 === 2) card(day(m, 22), A.cashCard.id, between(30, 75), "Home And Hardware", C.hardware);
  if (!isCurrent && index % 2 === 0) card(day(m, 26), A.cashCard.id, between(25, 60), pick(["Riverside Cinema", "City Stadium Tickets"]), C.events, "online");

  // Seasonal moments.
  if (mm === 12) {
    card(day(m, 6), A.cashCard.id, 186.4, "Shopwise", C.gifts, "online");
    card(day(m, 13), A.cashCard.id, 94.25, "Threadline Apparel", C.gifts);
    card(day(m, 20), A.travelCard.id, 412, "Skyward Airlines", C.flights, "online");
    add(day(m, 15), A.checking.id, 100, "Food Bank Donation", cat(C.donation), "online");
  }
  if (mm === 2) card(day(m, 14), A.cashCard.id, 128.6, "Basil & Vine", C.restaurant);
  if (mm === 3) card(day(m, 9), A.cashCard.id, 189.5, "Downtown Dental", C.dental);
  if (mm === 5) card(day(m, 14), A.cashCard.id, 412.8, "Precision Auto Service", C.carService);
  if (mm === 7) {
    card(day(m, 2), A.travelCard.id, 538, "Skyward Airlines", C.flights, "online");
    card(day(m, 12), A.travelCard.id, 684.3, "Seaside Inn", C.lodging, "online");
    card(day(m, 13), A.travelCard.id, 96.2, "Coastal Kitchen", C.restaurant);
  }
  if (mm === 8) card(day(m, 9), A.promo.id, 2400, "TechHub Electronics", C.electronics);
  if (mm === 10) card(day(m, 6), A.cashCard.id, 95, "Family Clinic", C.doctor);
}

// Card payments: last month's purchases in full, from checking on the 25th. The promo card's
// laptop is paid on a $200 plan from the month after the purchase.
for (const [index, m] of months.entries()) {
  if (index === 0) continue;
  const previous = months[index - 1]!;
  const cashDue = cardSpend.get(`${A.cashCard.id}:${previous}`) ?? 0;
  const travelDue = cardSpend.get(`${A.travelCard.id}:${previous}`) ?? 0;
  if (cashDue > 0) {
    add(day(m, 25), A.checking.id, cashDue, "Cash Rewards Card Payment", cat(C.cardPayment), "online");
    add(day(m, 25), A.cashCard.id, -cashDue, "Payment Thank You", cat(C.transferIn), "online");
  }
  if (travelDue > 0) {
    add(day(m, 27), A.checking.id, travelDue, "Travel Rewards Card Payment", cat(C.cardPayment), "online");
    add(day(m, 27), A.travelCard.id, -travelDue, "Payment Thank You", cat(C.transferIn), "online");
  }
  const purchaseIndex = months.findIndex((x) => monthNum(x) === 8);
  if (purchaseIndex >= 0 && index > purchaseIndex) {
    add(day(m, 28), A.checking.id, PROMO_PLAN, "0% Promo Card Payment", cat(C.cardPayment), "online", "stream_promo");
    add(day(m, 28), A.promo.id, -PROMO_PLAN, "Payment Thank You", cat(C.transferIn), "online");
  }
}

// This cycle's card balances: what has posted since the last payment.
const lastMonth = months.at(-1)!;
const prevMonth = months.at(-2)!;
const unpaid = (card: string) => {
  const thisMonth = cardSpend.get(`${card}:${lastMonth}`) ?? 0;
  // Last month's purchases are paid on the 25th or 27th of this month; until then they still count.
  const paid = txns.some((t) => t.account_id === card && t.amount < 0 && t.date.startsWith(lastMonth.slice(0, 7)));
  return money(thisMonth + (paid ? 0 : cardSpend.get(`${card}:${prevMonth}`) ?? 0));
};
TODAY_BALANCE.cashCard = unpaid(A.cashCard.id);
TODAY_BALANCE.travelCard = unpaid(A.travelCard.id);
const promoPaid = txns.filter((t) => t.account_id === A.promo.id && t.amount < 0).reduce((s, t) => s - t.amount, 0);
TODAY_BALANCE.promo = money(2400 - promoPaid);

txns.sort((a, b) => (a.date === b.date ? a.transaction_id.localeCompare(b.transaction_id) : b.date.localeCompare(a.date)));

// ---------- Investments (prices match src/market.ts) ----------

const SECURITIES = [
  { security_id: "sec_vti", name: "Total Stock Market ETF", ticker_symbol: "VTI", type: "etf", close_price: 280 },
  { security_id: "sec_voo", name: "S&P 500 Index ETF", ticker_symbol: "VOO", type: "etf", close_price: 620 },
  { security_id: "sec_vxus", name: "Total International Stock ETF", ticker_symbol: "VXUS", type: "etf", close_price: 70 },
  { security_id: "sec_bnd", name: "Total Bond Market ETF", ticker_symbol: "BND", type: "etf", close_price: 72 },
  { security_id: "sec_aapl", name: "Apple", ticker_symbol: "AAPL", type: "equity", close_price: 270 },
  { security_id: "sec_msft", name: "Microsoft", ticker_symbol: "MSFT", type: "equity", close_price: 510 },
  { security_id: "sec_nvda", name: "NVIDIA", ticker_symbol: "NVDA", type: "equity", close_price: 185 },
  { security_id: "sec_googl", name: "Alphabet", ticker_symbol: "GOOGL", type: "equity", close_price: 215 },
  { security_id: "sec_btc", name: "Bitcoin", ticker_symbol: "BTC", type: "cryptocurrency", close_price: 71000 },
  { security_id: "sec_cash", name: "Cash", ticker_symbol: null, type: "cash", close_price: 1, is_cash_equivalent: true },
] as const;
const price = new Map(SECURITIES.map((s) => [s.security_id, s.close_price]));

/** [account, security, quantity, cost basis as a share of value]. */
const HOLDINGS: Array<[string, string, number, number]> = [
  [A.ira.id, "sec_vti", 70, 0.84],
  [A.ira.id, "sec_vxus", 120, 0.9],
  [A.ira.id, "sec_bnd", 80, 1.02],
  [A.ira.id, "sec_cash", 740, 1],
  [A.k401.id, "sec_voo", 60, 0.78],
  [A.k401.id, "sec_vti", 60, 0.8],
  [A.k401.id, "sec_vxus", 140, 0.88],
  [A.k401.id, "sec_bnd", 100, 1.01],
  [A.k401.id, "sec_cash", 1000, 1],
  [A.brokerage.id, "sec_aapl", 20, 0.72],
  [A.brokerage.id, "sec_msft", 10, 0.75],
  [A.brokerage.id, "sec_nvda", 20, 0.46],
  [A.brokerage.id, "sec_googl", 10, 0.81],
  [A.brokerage.id, "sec_btc", 0.02, 0.62],
  [A.brokerage.id, "sec_cash", 430, 1],
];
const holdingsValue = (account: string) => money(HOLDINGS.filter(([a]) => a === account).reduce((s, [, sec, q]) => s + q * price.get(sec)!, 0));

// ---------- Balance history: month-ends, worked back from today ----------

/** Net change to an account after a date, from its transactions (Plaid sign: positive is money out). */
function changeAfter(account: string, date: string, liability: boolean) {
  return txns.filter((t) => t.account_id === account && t.date > date).reduce((s, t) => s + (liability ? t.amount : -t.amount), 0);
}
const monthEnds = months.slice(0, -1).map((m) => day(m, 31));
// Today's checking balance is whatever keeps every past month-end above the cash cushion.
const CHECKING_FLOOR = 2200;
const lowestBefore = Math.min(...monthEnds.map((date) => -changeAfter(A.checking.id, date, false)));
TODAY_BALANCE.checking = Math.max(TODAY_BALANCE.checking, money(Math.ceil((CHECKING_FLOOR - lowestBefore) / 50) * 50));
const history: Array<{ accountId: string; date: string; balanceCents: number }> = [];
const cents = (n: number) => Math.round(n * 100);
for (const date of monthEnds) {
  const monthsBack = months.length - 1 - monthEnds.indexOf(date);
  const point = (accountId: string, balance: number) => history.push({ accountId, date, balanceCents: cents(Math.max(0, balance)) });
  point(A.checking.id, TODAY_BALANCE.checking - changeAfter(A.checking.id, date, false));
  point(A.savings.id, TODAY_BALANCE.savings - changeAfter(A.savings.id, date, false));
  point(A.cd.id, TODAY_BALANCE.cd / (1 + 0.045 / 12) ** monthsBack);
  point(A.cashCard.id, TODAY_BALANCE.cashCard - changeAfter(A.cashCard.id, date, true));
  point(A.travelCard.id, TODAY_BALANCE.travelCard - changeAfter(A.travelCard.id, date, true));
  point(A.promo.id, TODAY_BALANCE.promo - changeAfter(A.promo.id, date, true));
  // Loans fall by their principal each month; investments grow with contributions and markets.
  point(A.auto.id, TODAY_BALANCE.auto + monthsBack * 318);
  point(A.personal.id, TODAY_BALANCE.personal + monthsBack * 131);
  point(A.mortgage.id, TODAY_BALANCE.mortgage + monthsBack * 790);
  const market = (rate: number, wobble: number) => (1 + rate) ** -monthsBack * (1 + Math.sin(monthsBack * 1.7) * wobble);
  point(A.ira.id, (holdingsValue(A.ira.id) - monthsBack * ROTH_TRANSFER) * market(0.0055, 0.012));
  point(A.k401.id, (holdingsValue(A.k401.id) - monthsBack * 950) * market(0.0055, 0.012));
  point(A.brokerage.id, (holdingsValue(A.brokerage.id) - monthsBack * BROKERAGE_TRANSFER) * market(0.008, 0.025));
}

// ---------- Recurring streams ----------

function stream(id: string, account: string, merchant: string, category: readonly [string, string], frequency: string) {
  const ids = txns.filter((t) => t.stream === id).sort((a, b) => a.date.localeCompare(b.date));
  const last = ids.at(-1)!;
  const average = money(ids.reduce((s, t) => s + t.amount, 0) / ids.length);
  const lastDay = Number(last.date.slice(8));
  const next = frequency === "SEMI_MONTHLY"
    ? (lastDay < 15 ? `${last.date.slice(0, 8)}15` : day(monthStart(last.date, 1), 1))
    : day(monthStart(last.date, 1), lastDay);
  return {
    stream_id: id,
    account_id: account,
    description: merchant.toUpperCase(),
    merchant_name: merchant,
    first_date: ids[0]!.date,
    last_date: last.date,
    predicted_next_date: next,
    frequency,
    transaction_ids: ids.map((t) => t.transaction_id),
    average_amount: { amount: average, iso_currency_code: "USD" },
    last_amount: { amount: last.amount, iso_currency_code: "USD" },
    is_active: true,
    status: "MATURE",
    personal_finance_category: { primary: category[0], detailed: category[1], confidence_level: "VERY_HIGH" },
  };
}

const outflowStreams = [
  stream("stream_mortgage", A.checking.id, "Lakeside Home Loans", C.mortgage, "MONTHLY"),
  stream("stream_auto", A.checking.id, "Summit Auto Finance", C.car, "MONTHLY"),
  stream("stream_personal", A.checking.id, "Harbor Personal Lending", C.personalLoan, "MONTHLY"),
  stream("stream_insurance", A.checking.id, "Keystone Auto Insurance", C.insurance, "MONTHLY"),
  stream("stream_power", A.checking.id, "City Power & Light", C.electric, "MONTHLY"),
  stream("stream_water", A.checking.id, "Metro Water Utility", C.water, "MONTHLY"),
  stream("stream_internet", A.checking.id, "Fiberlink Internet", C.internet, "MONTHLY"),
  stream("stream_phone", A.checking.id, "Bluewave Mobile", C.phone, "MONTHLY"),
];

// Subscriptions on cards become streams too, so Recurring Charges lists them.
for (const [merchant, category, account, id] of [
  ["StreamFlix", C.streaming, A.travelCard.id, "stream_streamflix"],
  ["Tunewave", C.music, A.travelCard.id, "stream_tunewave"],
  ["Daily Ledger News", C.books, A.travelCard.id, "stream_news"],
  ["Peak Fitness", C.gym, A.cashCard.id, "stream_gym"],
] as const) {
  for (const t of txns) if (t.merchant === merchant) t.stream = id;
  outflowStreams.push(stream(id, account, merchant, category, "MONTHLY"));
}

// ---------- Write the fixture ----------

const plaidTxn = (t: Txn) => ({
  transaction_id: t.transaction_id,
  account_id: t.account_id,
  amount: t.amount,
  iso_currency_code: "USD",
  date: t.date,
  authorized_date: t.date,
  name: t.name,
  merchant_name: t.merchant,
  merchant_entity_id: null,
  logo_url: null,
  website: null,
  payment_channel: t.channel,
  pending: false,
  pending_transaction_id: null,
  personal_finance_category: { primary: t.category[0], detailed: t.category[1], confidence_level: "VERY_HIGH" },
});
const account = (key: keyof typeof ACCOUNTS, current: number, limit: number | null = null, available: number | null = null) => {
  const a = ACCOUNTS[key];
  return {
    account_id: a.id,
    balances: { available, current: money(current), limit, iso_currency_code: "USD" },
    mask: a.mask,
    name: a.name,
    official_name: null,
    type: a.type,
    subtype: a.subtype,
  };
};
const bankAccounts = [A.checking.id, A.savings.id, A.cd.id, A.auto.id, A.personal.id, A.cashCard.id, A.travelCard.id, A.promo.id, A.mortgage.id] as string[];

/** Average of the full months: income, and spending that is not a transfer or a payment to a card. */
const fullMonths = months.slice(0, -1);
const isTransfer = (t: Txn) => t.category[0] === "TRANSFER_OUT" || t.category[0] === "TRANSFER_IN" || t.category[1] === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
const inFull = (t: Txn) => fullMonths.some((m) => t.date.startsWith(m.slice(0, 7)));
const avgIncome = txns.filter((t) => inFull(t) && t.category[0] === "INCOME").reduce((s, t) => s - t.amount, 0) / fullMonths.length;
const avgSpending = txns.filter((t) => inFull(t) && t.amount > 0 && !isTransfer(t)).reduce((s, t) => s + t.amount, 0) / fullMonths.length;

const fixture = {
  user: {
    id: "user_demo",
    displayName: "Jordan Rivera",
    email: "jordan@example.com",
    preferences: { bufferTargetCents: 250000 },
    extensionSettings: { enabled: true, snoozedSites: [] },
  },
  income: {
    monthlyIncomeCents: PAYCHECK * 2 * 100,
    monthlyFixedCostsCents: cents(MORTGAGE_PAYMENT + INSURANCE + 250 + 80),
    monthlyDebtPaymentsCents: cents(MORTGAGE_PAYMENT + AUTO_PAYMENT + PERSONAL_PAYMENT + 35 + 25 + 40),
    monthlySpendingCents: cents(avgSpending),
    monthlySavingsCents: cents(PAYCHECK * 2 - avgSpending),
    paydayDayOfMonth: 15,
  },
  // The saved amounts add up to the savings balance, so a big purchase has no spare savings to
  // draw on and nudges a goal, as in the Copilot checkout demo.
  goals: [
    { id: "goal_emergency", userId: "user_demo", name: "Emergency fund", targetCents: 1800000, currentCents: 900000, targetDate: "2028-03-01", priorityRank: 1, flexibility: "non_negotiable", linkedAccountId: A.savings.id, status: "in_progress" },
    { id: "goal_japan", userId: "user_demo", name: "Japan trip", targetCents: 500000, currentCents: 185000, targetDate: "2027-10-01", priorityRank: 2, flexibility: "flexible", linkedAccountId: null, status: "in_progress", kind: "trip" },
    { id: "goal_renovation", userId: "user_demo", name: "Kitchen renovation", targetCents: 1000000, currentCents: 225000, targetDate: "2028-09-01", priorityRank: 3, flexibility: "flexible", linkedAccountId: null, status: "in_progress" },
    { id: "goal_car", userId: "user_demo", name: "Next car", targetCents: 800000, currentCents: 110000, targetDate: "2029-06-01", priorityRank: 4, flexibility: "flexible", linkedAccountId: null, status: "in_progress" },
    { id: "goal_house", userId: "user_demo", name: "House down payment", targetCents: 4000000, currentCents: 430000, targetDate: "2029-09-01", priorityRank: 5, flexibility: "flexible", linkedAccountId: null, status: "not_started" },
  ],
  lifeEvents: [],
  bank: [
    {
      item: { item_id: "item_demo_bank", institution_id: "ins_demo_bank", institution_name: "Demo Bank" },
      accounts: [
        account("checking", TODAY_BALANCE.checking, null, TODAY_BALANCE.checking),
        account("savings", TODAY_BALANCE.savings, null, TODAY_BALANCE.savings),
        account("cd", TODAY_BALANCE.cd),
        account("auto", TODAY_BALANCE.auto),
        account("personal", TODAY_BALANCE.personal),
        account("cashCard", TODAY_BALANCE.cashCard, LIMITS.cashCard, money(LIMITS.cashCard - TODAY_BALANCE.cashCard)),
        account("travelCard", TODAY_BALANCE.travelCard, LIMITS.travelCard, money(LIMITS.travelCard - TODAY_BALANCE.travelCard)),
        account("promo", TODAY_BALANCE.promo, LIMITS.promo, money(LIMITS.promo - TODAY_BALANCE.promo)),
        account("mortgage", TODAY_BALANCE.mortgage),
      ],
      transactions: txns.filter((t) => bankAccounts.includes(t.account_id)).map(plaidTxn),
      transactions_cursor: `demo-cursor-${AS_OF}`,
      liabilities: {
        credit: [
          { account_id: A.cashCard.id, aprs: [{ apr_percentage: 22.99, apr_type: "purchase_apr", balance_subject_to_apr: 0 }], is_overdue: false, last_payment_amount: money(cardSpend.get(`${A.cashCard.id}:${months.at(-2)}`) ?? 0), last_payment_date: day(months.at(-2)!, 25), last_statement_balance: money(cardSpend.get(`${A.cashCard.id}:${months.at(-2)}`) ?? 0), minimum_payment_amount: 35, next_payment_due_date: day(lastMonth, 25) },
          { account_id: A.travelCard.id, aprs: [{ apr_percentage: 21.49, apr_type: "purchase_apr", balance_subject_to_apr: 0 }], is_overdue: false, last_payment_amount: money(cardSpend.get(`${A.travelCard.id}:${months.at(-2)}`) ?? 0), last_payment_date: day(months.at(-2)!, 27), last_statement_balance: money(cardSpend.get(`${A.travelCard.id}:${months.at(-2)}`) ?? 0), minimum_payment_amount: 25, next_payment_due_date: day(lastMonth, 27) },
          { account_id: A.promo.id, aprs: [{ apr_percentage: 0, apr_type: "special", balance_subject_to_apr: TODAY_BALANCE.promo }, { apr_percentage: 24.99, apr_type: "purchase_apr", balance_subject_to_apr: 0 }], is_overdue: false, last_payment_amount: PROMO_PLAN, last_payment_date: day(months.at(-2)!, 28), last_statement_balance: money(TODAY_BALANCE.promo), minimum_payment_amount: 40, next_payment_due_date: day(lastMonth, 28) },
        ],
        mortgage: [
          { account_id: A.mortgage.id, interest_rate: { percentage: 3.875, type: "fixed" }, next_monthly_payment: MORTGAGE_PAYMENT, next_payment_due_date: day(monthStart(AS_OF, 1), 1), origination_date: "2019-04-12", maturity_date: "2049-05-01", origination_principal_amount: 148000 },
        ],
        student: [],
      },
      recurring: {
        inflow_streams: [stream("stream_payroll", A.checking.id, "Northwind Design Co", C.paycheck, "SEMI_MONTHLY")],
        outflow_streams: outflowStreams,
      },
      investments: { holdings: [], securities: [] },
    },
    {
      item: { item_id: "item_demo_brokerage", institution_id: "ins_demo_brokerage", institution_name: "Demo Brokerage" },
      accounts: [account("ira", holdingsValue(A.ira.id)), account("k401", holdingsValue(A.k401.id)), account("brokerage", holdingsValue(A.brokerage.id))],
      transactions: txns.filter((t) => !bankAccounts.includes(t.account_id)).map(plaidTxn),
      transactions_cursor: `demo-cursor-${AS_OF}`,
      liabilities: { credit: null, mortgage: null, student: null },
      recurring: { inflow_streams: [], outflow_streams: [] },
      investments: {
        holdings: HOLDINGS.map(([account_id, security_id, quantity, basis]) => {
          const value = money(quantity * price.get(security_id)!);
          return { account_id, security_id, quantity, institution_price: price.get(security_id)!, institution_value: value, cost_basis: money(value * basis), iso_currency_code: "USD" };
        }),
        securities: SECURITIES.map((s) => ({ ...s, close_price_as_of: AS_OF, is_cash_equivalent: "is_cash_equivalent" in s ? s.is_cash_equivalent : false })),
      },
    },
  ],
  accountDetails: {
    [A.savings.id]: { annualRate: 0.041 },
    [A.cd.id]: { annualRate: 0.045 },
    [A.auto.id]: { annualRate: 0.059, minimumPaymentCents: cents(AUTO_PAYMENT) },
    [A.personal.id]: { annualRate: 0.099, minimumPaymentCents: cents(PERSONAL_PAYMENT) },
    [A.promo.id]: { promoRateEndsOn: "2027-06-30" },
  },
  budgets: [
    { category: "groceries", monthlyLimitCents: 55000 },
    { category: "dining_out", monthlyLimitCents: 32000 },
    { category: "shopping", monthlyLimitCents: 30000 },
    { category: "entertainment", monthlyLimitCents: 12000 },
    { category: "transportation", monthlyLimitCents: 22000 },
    { category: "utilities", monthlyLimitCents: 32000 },
    { category: "personal_care", monthlyLimitCents: 12000 },
    { category: "home_pets", monthlyLimitCents: 10000 },
  ],
  balanceHistory: history,
};

const out = fileURLToPath(new URL("../fixtures/planner.json", import.meta.url));
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
const assets = TODAY_BALANCE.checking + TODAY_BALANCE.savings + TODAY_BALANCE.cd + holdingsValue(A.ira.id) + holdingsValue(A.k401.id) + holdingsValue(A.brokerage.id);
const debts = TODAY_BALANCE.auto + TODAY_BALANCE.personal + TODAY_BALANCE.cashCard + TODAY_BALANCE.travelCard + TODAY_BALANCE.promo + TODAY_BALANCE.mortgage;
console.log(`Wrote ${out}: ${txns.length} transactions from ${firstMonth} to ${AS_OF}, ${history.length} balance points.`);
console.log(`Average month: income $${avgIncome.toFixed(2)}, spending $${avgSpending.toFixed(2)}.`);
console.log(`Assets $${assets.toFixed(2)}, debts $${debts.toFixed(2)}, net worth $${(assets - debts).toFixed(2)}.`);
