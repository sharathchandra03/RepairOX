import * as React from "react";

/**
 * WalkInIcon — a side-facing "person walking" line icon used for the Walk-In
 * sidebar entry. Uses the geometry from the Tabler Icons `walk` glyph
 * (MIT-licensed) so it reads as a clear walking pose: round head, striding
 * legs (one forward, one back) and an arm swinging opposite the legs.
 *
 * It renders in the same style as the Lucide icons used across the RepairOX
 * sidebar: 24×24 viewBox, stroke `currentColor`, stroke-width 2, round caps and
 * joins. Color and size are inherited from the parent via `currentColor` and the
 * passed `className`, so it stays visually consistent with the other nav icons
 * (muted grey when inactive, RepairOX blue / white when active).
 */
export function WalkInIcon({
  className,
  title = "Walk-In",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* head */}
      <path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      {/* back leg */}
      <path d="M7 21l3 -4" />
      {/* front leg + torso */}
      <path d="M16 21l-2 -4l-3 -3l1 -6" />
      {/* arm swinging forward */}
      <path d="M6 12l2 -3l4 -1l3 3l3 1" />
    </svg>
  );
}

export default WalkInIcon;
