import Image from "next/image";
import type { Photo } from "./photos";

interface ListingCardProps {
  photo: Photo;
  title: string;
  /** Short lines under the title, in muted text. */
  lines?: string[];
  /** A white pill over the top-left of the photo, like Airbnb's "Guest favorite". */
  badge?: string;
}

/**
 * The Airbnb property card: a square photo with 14px corners, an optional floating badge, then
 * a few lines of details. The photo zooms slightly on hover.
 */
export function ListingCard({ photo, title, lines = [], badge }: ListingCardProps) {
  return (
    <article className="group">
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-card)] bg-inset">
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes="(min-width: 1024px) 230px, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {badge && (
          <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-ink shadow-[var(--shadow-float)]">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold text-ink">{title}</h3>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 text-sm leading-snug text-muted">
          {line}
        </p>
      ))}
    </article>
  );
}
