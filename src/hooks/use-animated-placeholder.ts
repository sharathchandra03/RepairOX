"use client";

import { useEffect, useRef, useState } from "react";

/* ── Animated search placeholder ──────────────────────────────────────────
   Drives a search input's placeholder so a CONSTANT prefix (e.g. "Search by ")
   stays fixed while the trailing WORD cycles with a typewriter effect:

     Search by lead ID  →  Search by name  →  Search by phone  →  …

   A native <input>'s `placeholder` can't be animated with CSS, so we animate
   it by updating the string on a timer (type the word out, hold, delete, move
   to the next). The effect:
     - PAUSES (showing the full prefix + first word) whenever the input has a
       value or is focused — so it never distracts while the user is typing.
     - Honours `prefers-reduced-motion`: no cycling, just prefix + first word.
     - Loops forever through the word list while idle + empty + blurred.

   This is a SHARED primitive — every animated search bar reuses it so the
   cadence and behaviour are identical across the app. */

export interface AnimatedPlaceholderOptions {
  /** Constant leading text that never animates (e.g. "Search by "). */
  prefix: string;
  /** The rotating words typed out one at a time (e.g. ["lead ID","name"]). */
  words: string[];
  /** Freeze the animation (input has a value or is focused). */
  paused?: boolean;
  /** Per-character typing speed (ms). */
  typeMs?: number;
  /** Per-character deleting speed (ms). */
  deleteMs?: number;
  /** How long a fully-typed word is held before it deletes (ms). */
  holdMs?: number;
}

export function useAnimatedPlaceholder({
  prefix,
  words,
  paused = false,
  typeMs = 55,
  deleteMs = 28,
  holdMs = 1100,
}: AnimatedPlaceholderOptions): string {
  const list = words.length > 0 ? words : [""];
  const [text, setText] = useState(() => prefix + list[0]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Respect reduced-motion AND the paused state (focused / has value): show a
    // stable, fully-typed prefix + first word, no cycling.
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (paused || reduce || list.length === 0) {
      if (timer.current) clearTimeout(timer.current);
      setText(prefix + list[0]);
      return;
    }

    let wordIndex = 0;
    let charCount = list[0].length; // start fully typed on the first word
    let deleting = false;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const word = list[wordIndex];

      if (!deleting) {
        charCount++;
        setText(prefix + word.slice(0, charCount));
        if (charCount >= word.length) {
          deleting = true;
          timer.current = setTimeout(tick, holdMs);
          return;
        }
        timer.current = setTimeout(tick, typeMs);
      } else {
        charCount--;
        setText(prefix + word.slice(0, Math.max(0, charCount)));
        if (charCount <= 0) {
          deleting = false;
          wordIndex = (wordIndex + 1) % list.length;
          charCount = 0;
          timer.current = setTimeout(tick, typeMs);
          return;
        }
        timer.current = setTimeout(tick, deleteMs);
      }
    };

    // Show the first word in full, then begin the delete→next cycle after a hold.
    setText(prefix + list[0]);
    timer.current = setTimeout(tick, holdMs);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // Re-run when the prefix/words/paused change. The word list is joined so a
    // new array with identical contents doesn't needlessly restart the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, list.join("\u0001"), paused, typeMs, deleteMs, holdMs]);

  return text;
}
