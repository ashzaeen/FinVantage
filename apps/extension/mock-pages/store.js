/*
 * Circuit & Co. demo store: the catalog, product art, and shared header.
 * Fictional brand and products. The Copilot reads only the price element on a product or
 * checkout page; nothing here talks to FinVantage.
 */

const CATALOG = [
  { id: "pulse-buds", name: "Pulse Buds Lite", kind: "earbuds", category: "Audio", price: 1500, color: "#e8e6f9", accent: "#3432c7",
    blurb: "Lightweight wired earbuds with an inline mic.", specs: ["Inline mic and remote", "3.5 mm plug", "Three ear-tip sizes"] },
  { id: "clear-grip", name: "Clear Grip Phone Case", kind: "case", category: "Accessories", price: 1900, color: "#e3f1ee", accent: "#1f8f7a",
    blurb: "Slim, drop-tested case with raised camera edges.", specs: ["Drop-tested to 6 ft", "Wireless charging friendly", "Fits most 6.1-inch phones"] },
  { id: "volt-65", name: "Volt 65W USB-C Charger", kind: "charger", category: "Accessories", price: 2900, color: "#f1efe9", accent: "#2a2d34",
    blurb: "Charges a laptop and a phone at once.", specs: ["65 W total output", "Two USB-C ports", "Folding plug"] },
  { id: "halo-mini", name: "Halo Mini Speaker", kind: "speaker", category: "Audio", price: 7900, color: "#f6e9e2", accent: "#c4553a",
    blurb: "Room-filling sound in a palm-sized speaker.", specs: ["12-hour battery", "Water resistant", "Pairs in stereo"] },
  { id: "pulse-studio", name: "Pulse Studio Headphones", kind: "headphones", category: "Audio", price: 12900, color: "#e8e6f9", accent: "#3432c7",
    blurb: "Closed-back studio headphones tuned for detail.", specs: ["40 mm drivers", "Detachable cable", "Memory-foam ear pads"] },
  { id: "stride-watch", name: "Stride Fitness Watch", kind: "watch", category: "Wearables", price: 19900, color: "#e5eef6", accent: "#2563a8",
    blurb: "Heart rate, sleep, and GPS runs on your wrist.", specs: ["Built-in GPS", "7-day battery", "Swim proof"] },
  { id: "slate-11", name: "Slate 11 Tablet", kind: "tablet", category: "Tablets", price: 34900, color: "#efeef3", accent: "#4b4f5c",
    blurb: "An 11-inch tablet for reading, notes, and streaming.", specs: ['11" display', "128 GB storage", "Stylus support"] },
  { id: "nova-console", name: "Nova Game Console", kind: "console", category: "Gaming", price: 49900, color: "#ebeef2", accent: "#1d2026",
    blurb: "4K gaming with a quick-resume library.", specs: ["4K at 120 fps", "1 TB storage", "One controller included"] },
  { id: "vista-55", name: 'Vista 55" 4K TV', kind: "tv", category: "TV & Home", price: 89900, color: "#e7edf3", accent: "#1f5a9c",
    blurb: "A bright 55-inch 4K panel with built-in streaming apps.", specs: ['55" 4K HDR', "120 Hz refresh", "Three HDMI ports"] },
  { id: "aperture-m", name: "Aperture M Camera", kind: "camera", category: "Cameras", price: 109900, color: "#f0ede8", accent: "#2a2d34",
    blurb: "A compact mirrorless camera with a 24 MP sensor.", specs: ["24 MP sensor", "4K video", "Kit lens included"] },
  { id: "arc-14", name: "Arc 14 Laptop", kind: "laptop", category: "Laptops", price: 149900, color: "#e8e6f9", accent: "#3432c7",
    blurb: "A thin 14-inch laptop with all-day battery.", specs: ['14.2" display', "16 GB memory", "512 GB storage"] },
  { id: "arc-16-pro", name: "Arc 16 Pro Laptop", kind: "laptop", category: "Laptops", price: 329900, color: "#2a2d34", accent: "#8f8cf5",
    blurb: "Our most powerful laptop, built for creative work.", specs: ['16.2" display', "36 GB memory", "1 TB storage"] },
];

function formatPrice(cents) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function findProduct(id) {
  return CATALOG.find((p) => p.id === id) || null;
}

/** Simple flat illustration per product kind, sized to its container. */
function productArt(p) {
  const a = p.accent;
  const shapes = {
    earbuds: `<path d="M70 50c-14 0-22 10-22 22s8 20 18 20c4 0 6 6 6 14v24" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
      <path d="M130 50c14 0 22 10 22 22s-8 20-18 20c-4 0-6 6-6 14v24" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="70" cy="50" r="13" fill="${a}"/><circle cx="130" cy="50" r="13" fill="${a}"/>
      <path d="M72 130c10 8 46 8 56 0" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/>`,
    case: `<rect x="72" y="20" width="56" height="110" rx="14" fill="#fff" stroke="${a}" stroke-width="5"/>
      <rect x="82" y="30" width="22" height="26" rx="7" fill="${a}" opacity="0.85"/>
      <circle cx="89" cy="38" r="3.5" fill="#fff"/><circle cx="97" cy="48" r="3.5" fill="#fff"/>`,
    charger: `<rect x="66" y="40" width="68" height="72" rx="14" fill="${a}"/>
      <rect x="80" y="100" width="14" height="6" rx="2" fill="#9ea2ab"/><rect x="106" y="100" width="14" height="6" rx="2" fill="#9ea2ab"/>
      <path d="M86 40V24M114 40V24" stroke="#9ea2ab" stroke-width="6" stroke-linecap="round"/>
      <path d="M103 58l-10 16h12l-8 16" fill="none" stroke="#f2c94c" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`,
    speaker: `<rect x="62" y="30" width="76" height="96" rx="38" fill="${a}"/>
      <circle cx="100" cy="86" r="24" fill="#fff" opacity="0.22"/><circle cx="100" cy="86" r="12" fill="#fff" opacity="0.35"/>
      <circle cx="100" cy="48" r="5" fill="#fff" opacity="0.6"/>`,
    headphones: `<path d="M56 94V76a44 44 0 0 1 88 0v18" fill="none" stroke="#2a2d34" stroke-width="9" stroke-linecap="round"/>
      <rect x="44" y="86" width="28" height="44" rx="12" fill="${a}"/><rect x="128" y="86" width="28" height="44" rx="12" fill="${a}"/>
      <rect x="50" y="94" width="10" height="28" rx="5" fill="#fff" opacity="0.3"/><rect x="140" y="94" width="10" height="28" rx="5" fill="#fff" opacity="0.3"/>`,
    watch: `<rect x="82" y="14" width="36" height="122" rx="12" fill="#2a2d34"/>
      <rect x="66" y="44" width="68" height="62" rx="18" fill="#1d2026" stroke="${a}" stroke-width="4"/>
      <path d="M80 76h10l5-10 8 20 5-10h12" fill="none" stroke="#6cc48f" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`,
    tablet: `<rect x="40" y="22" width="120" height="106" rx="10" fill="${a}"/>
      <rect x="47" y="29" width="106" height="92" rx="5" fill="#c9cdf4"/>
      <path d="M47 100c22-20 40-26 58-14s30 6 48-6v41H47z" fill="#8f93ea"/>`,
    console: `<rect x="48" y="30" width="104" height="80" rx="12" fill="#fff" stroke="${a}" stroke-width="5"/>
      <path d="M48 52h104" stroke="${a}" stroke-width="3"/>
      <rect x="60" y="116" width="80" height="20" rx="10" fill="${a}"/>
      <circle cx="76" cy="126" r="4" fill="#fff"/><circle cx="124" cy="126" r="4" fill="#fff"/>
      <circle cx="140" cy="41" r="4" fill="#6cc48f"/>`,
    tv: `<rect x="26" y="20" width="148" height="92" rx="6" fill="#1d2026"/>
      <rect x="31" y="25" width="138" height="82" rx="3" fill="${a}"/>
      <path d="M31 90c30-24 56-32 80-18s38 6 58-8v43H31z" fill="#7fb0e6"/><circle cx="140" cy="46" r="10" fill="#f2c94c"/>
      <path d="M86 112l-8 18M114 112l8 18M70 130h60" stroke="#1d2026" stroke-width="5" stroke-linecap="round"/>`,
    camera: `<rect x="40" y="46" width="120" height="78" rx="12" fill="${a}"/>
      <rect x="56" y="34" width="34" height="16" rx="5" fill="${a}"/>
      <circle cx="108" cy="85" r="30" fill="#4a525c"/><circle cx="108" cy="85" r="20" fill="#1d2026"/>
      <circle cx="100" cy="77" r="6" fill="#fff" opacity="0.35"/><rect x="132" y="56" width="16" height="8" rx="2" fill="#f2c94c"/>`,
    laptop: `<rect x="44" y="24" width="112" height="76" rx="6" fill="#2a2d34"/>
      <rect x="49" y="29" width="102" height="66" rx="3" fill="${a}"/>
      <circle cx="124" cy="48" r="16" fill="#fff" opacity="0.15"/>
      <path d="M26 104h148l-8 10a8 8 0 0 1-6 3H40a8 8 0 0 1-6-3z" fill="#c9ccd3"/>`,
  };
  return `<svg viewBox="0 0 200 150" role="img" aria-label="${p.name}" style="width:100%;height:100%;display:block">
    <rect width="200" height="150" fill="${p.color}"/>${shapes[p.kind]}</svg>`;
}

/** The cart holds one item id for this browser tab. Storage can be unavailable, so guard it. */
function cartItem() {
  try { return sessionStorage.getItem("circuit-cart"); } catch { return null; }
}
function addToCart(id) {
  try { sessionStorage.setItem("circuit-cart", id); } catch {}
}

const CATEGORIES = ["Laptops", "Tablets", "Audio", "TV & Home", "Cameras", "Gaming", "Wearables", "Accessories"];

function storeHeader(current) {
  const cart = cartItem();
  return `
  <header class="sh">
    <div class="sh-inner">
      <a class="sh-logo" href="/shop.html">
        <span class="sh-mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M10.5 3.5A5 5 0 1 0 10.5 10.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg></span>
        Circuit &amp; Co.
      </a>
      <form class="sh-search" action="/shop.html" role="search">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m11 11 3.5 3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <input name="q" placeholder="Search Circuit &amp; Co." aria-label="Search" />
      </form>
      <nav class="sh-acct"><span>Hi, Jordan</span>
        <a class="sh-cart" href="${cart ? `/checkout.html?id=${cart}` : "/shop.html"}"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 3h3l2 10h9l2-7H6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="8" cy="17" r="1.5" fill="currentColor"/><circle cx="15" cy="17" r="1.5" fill="currentColor"/></svg>Cart<span class="sh-count" ${cart ? "" : "hidden"}>1</span></a>
      </nav>
    </div>
    <nav class="sh-cats" aria-label="Categories"><a href="/shop.html" ${!current ? 'aria-current="page"' : ""}>All</a>${CATEGORIES
      .map((c) => `<a href="/shop.html?cat=${encodeURIComponent(c)}" ${c === current ? 'aria-current="page"' : ""}>${c}</a>`).join("")}</nav>
  </header>`;
}

const STORE_CSS = `
  :root { --ink: #15171c; --muted: #646a76; --line: #e6e8ec; --soft: #f5f6f8; --brand: #3432c7; --ok: #1d7a4e; --sale: #c4383a; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif; color: var(--ink); background: #fff; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  .sh { border-bottom: 1px solid var(--line); background: #fff; }
  .sh-inner { max-width: 1200px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; gap: 28px; }
  .sh-logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 19px; letter-spacing: -0.02em; white-space: nowrap; }
  .sh-mark { width: 26px; height: 26px; border-radius: 7px; background: var(--brand); display: grid; place-items: center; }
  .sh-search { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--soft); border-radius: 10px; padding: 10px 14px; color: var(--muted); }
  .sh-search input { border: 0; background: none; font: inherit; flex: 1; outline: none; color: var(--ink); }
  .sh-acct { display: flex; gap: 22px; font-size: 14px; color: var(--muted); white-space: nowrap; align-items: center; }
  .sh-search { min-width: 0; }
  .sh-search input { min-width: 0; }
  .sh-cart { display: flex; align-items: center; gap: 6px; color: var(--ink); font-weight: 600; }
  .sh-count { background: var(--brand); color: #fff; border-radius: 999px; font-size: 11px; min-width: 18px; height: 18px; display: inline-grid; place-items: center; padding: 0 5px; }
  .sh-cats { max-width: 1200px; margin: 0 auto; padding: 0 24px 12px; display: flex; gap: 22px; font-size: 14px; color: var(--muted); overflow-x: auto; scrollbar-width: none; }
  .sh-cats a { white-space: nowrap; }
  .sh-cats a:hover, .sh-cats a[aria-current] { color: var(--ink); }
  .sh-cats a[aria-current] { font-weight: 600; }
  .foot { border-top: 1px solid var(--line); margin-top: 60px; padding: 28px 24px; color: var(--muted); font-size: 13px; text-align: center; }
  @media (max-width: 720px) {
    .sh-inner { flex-wrap: wrap; gap: 12px; padding: 12px 16px; }
    .sh-search { order: 3; flex-basis: 100%; }
    .sh-acct { margin-left: auto; }
    .sh-acct > span { display: none; }
    .sh-cats { padding: 0 16px 12px; gap: 18px; }
  }
`;
