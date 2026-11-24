import type { Ref } from "react";

export type OrbState = "listening" | "thinking" | "speaking" | "muted" | "ending";

/**
 * The Advisor's orb. Pure presentation: the look comes from `data-state` and, while listening,
 * from the `--level` variable that `useMicLevel` writes onto this element. It fills its parent,
 * so the parent sets the size.
 */
export function AdvisorOrb({ state, orbRef }: { state: OrbState; orbRef?: Ref<HTMLDivElement> }) {
  return (
    <div ref={orbRef} className="voice-orb" data-state={state} aria-hidden>
      <span className="voice-orb__glow" />
      <span className="voice-orb__ripple" />
      <span className="voice-orb__ripple" />
      <span className="voice-orb__core">
        <span className="voice-orb__swirl" />
      </span>
    </div>
  );
}
