/**
 * Landing page photos, saved in `public/landing`. Every one is CC0 (no attribution required),
 * found through Openverse. They are stand-ins that show the kind of thing, not the user's own.
 * Keep the source links so anyone can re-check the license.
 */
export interface Photo {
  src: string;
  alt: string;
  source: string;
}

export const PHOTOS = {
  dashboard: { src: "/landing/step-accounts.jpg", alt: "Hands working on a laptop at a desk", source: "https://stocksnap.io/photo/office-work-42H3JH8QI5" },
  lifeEvents: { src: "/landing/goal-house.webp", alt: "A two-storey house with a front porch", source: "https://www.rawpixel.com/image/6023185" },
  advisor: { src: "/landing/step-future.webp", alt: "An open planner with a pen", source: "https://www.rawpixel.com/image/3299160" },
  reports: { src: "/landing/reports.jpg", alt: "A piggy bank, a calculator and glasses on a notepad", source: "https://stocksnap.io/photo/piggy-bank-ZLEVSWFWZC" },
  copilot: { src: "/landing/step-shop.webp", alt: "Shopping on a phone with a card in hand", source: "https://www.rawpixel.com/image/5960990" },
} satisfies Record<string, Photo>;
