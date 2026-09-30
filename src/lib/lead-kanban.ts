/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Kanban (PERSONAL visual sales workspace) data model.

   The Kanban is a PERSONAL visualization layer over the CANONICAL leads. It is
   NOT a second Lead Status system.

     • A Lead is the single source of truth (see leads-data.ts). The Kanban NEVER
       duplicates a lead — it references a lead by id.
     • A board belongs to ONE user (owner). Boards → Columns → ordered card
       memberships (arrays of lead ids). One user's board configuration never
       affects another user's.
     • Dragging a card changes ONLY the personal placement/order. It NEVER
       changes Lead Status / Priority / Owner / Follow-up.

   Persistence mirrors the per-user preference pattern used by
   use-frozen-columns.ts: localStorage keyed by userId (DB-backed later without
   changing this shape). No React here — pure model + helpers.
   ────────────────────────────────────────────────────────────────────────── */

/* ─── Controlled color palette ────────────────────────────────────────────
   A restrained, professional set of accent colors (used for board identity +
   column identity + the matching top-filter pill). Never arbitrary neon. */

export type KanbanColor =
  | "blue" | "indigo" | "purple" | "teal" | "green"
  | "amber" | "orange" | "red" | "gray";

export interface KanbanColorToken {
  key: KanbanColor;
  label: string;
  /** Solid dot / accent (bg). */
  dot: string;
  /** Small text-on-soft chip (bg + text + ring) for the top filter + column head. */
  chip: string;
  /** Column top-border accent. */
  bar: string;
  /** Soft column background tint (very subtle). */
  soft: string;
  /** Selected-filter ring/border. */
  ring: string;
  /** Whole-board CANVAS wash — a soft themed gradient behind all columns so the
   *  Kanban reads as one distinct, board-colored surface. Kept subtle so cards
   *  and text stay perfectly readable. */
  canvas: string;
  /** A subtle same-hue divider/edge for the themed canvas frame. */
  edge: string;
}

export const KANBAN_COLORS: KanbanColorToken[] = [
  { key: "blue",   label: "Blue",   dot: "bg-sky-500",     chip: "bg-sky-50 text-sky-700 ring-sky-200",         bar: "bg-sky-500",     soft: "bg-sky-100/70",     ring: "ring-sky-400",     canvas: "bg-gradient-to-br from-sky-50 via-white to-sky-100/50",       edge: "border-sky-200/70" },
  { key: "indigo", label: "Indigo", dot: "bg-indigo-500",  chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", bar: "bg-indigo-500",  soft: "bg-indigo-100/70",  ring: "ring-indigo-400",  canvas: "bg-gradient-to-br from-indigo-50 via-white to-violet-100/50",  edge: "border-indigo-200/70" },
  { key: "purple", label: "Purple", dot: "bg-violet-500",  chip: "bg-violet-50 text-violet-700 ring-violet-200", bar: "bg-violet-500",  soft: "bg-violet-100/70",  ring: "ring-violet-400",  canvas: "bg-gradient-to-br from-violet-50 via-white to-fuchsia-100/50", edge: "border-violet-200/70" },
  { key: "teal",   label: "Teal",   dot: "bg-teal-500",    chip: "bg-teal-50 text-teal-700 ring-teal-200",       bar: "bg-teal-500",    soft: "bg-teal-100/70",    ring: "ring-teal-400",    canvas: "bg-gradient-to-br from-teal-50 via-white to-cyan-100/50",      edge: "border-teal-200/70" },
  { key: "green",  label: "Green",  dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", bar: "bg-emerald-500", soft: "bg-emerald-100/70", ring: "ring-emerald-400", canvas: "bg-gradient-to-br from-emerald-50 via-white to-teal-100/50",   edge: "border-emerald-200/70" },
  { key: "amber",  label: "Amber",  dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 ring-amber-200",    bar: "bg-amber-500",   soft: "bg-amber-100/70",   ring: "ring-amber-400",   canvas: "bg-gradient-to-br from-amber-50 via-white to-yellow-100/50",   edge: "border-amber-200/70" },
  { key: "orange", label: "Orange", dot: "bg-orange-500",  chip: "bg-orange-50 text-orange-700 ring-orange-200", bar: "bg-orange-500",  soft: "bg-orange-100/70",  ring: "ring-orange-400",  canvas: "bg-gradient-to-br from-orange-50 via-white to-amber-100/50",   edge: "border-orange-200/70" },
  { key: "red",    label: "Red",    dot: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 ring-rose-200",       bar: "bg-rose-500",    soft: "bg-rose-100/70",    ring: "ring-rose-400",    canvas: "bg-gradient-to-br from-rose-50 via-white to-pink-100/50",      edge: "border-rose-200/70" },
  { key: "gray",   label: "Gray",   dot: "bg-zinc-400",    chip: "bg-zinc-100 text-zinc-600 ring-zinc-200",      bar: "bg-zinc-400",    soft: "bg-zinc-100/80",    ring: "ring-zinc-400",    canvas: "bg-gradient-to-br from-zinc-50 via-white to-slate-100/60",     edge: "border-zinc-200/70" },
];

const COLOR_MAP: Record<KanbanColor, KanbanColorToken> = KANBAN_COLORS.reduce(
  (acc, c) => { acc[c.key] = c; return acc; },
  {} as Record<KanbanColor, KanbanColorToken>,
);

/** Resolve a color token, falling back to a neutral gray for unknown keys. */
export function kanbanColor(key: string | null | undefined): KanbanColorToken {
  return COLOR_MAP[(key as KanbanColor)] ?? COLOR_MAP.gray;
}

/* ─── Digital sticky-note colors (PERSONAL card organization) ──────────────
   A separate, controlled palette used ONLY for the personal "sticky note"
   tint of a Kanban card. This is a PERSONAL VISUAL attribute — never a Lead
   business field. It does not affect Lead Status / Priority / follow-up /
   reporting. "default" = neutral (the standard RepairOX card, no tint).

   The tints are deliberately SOFT so dark card text stays readable, and each
   note gets a slightly stronger top accent bar for the tactile note feel. */

export type NoteColor =
  | "default" | "yellow" | "blue" | "green" | "purple"
  | "orange" | "pink" | "teal" | "gray";

export interface NoteColorToken {
  key: NoteColor;
  label: string;
  /** Swatch dot in the picker. */
  dot: string;
  /** Soft card surface tint (readable dark text on top). "" = neutral. */
  surface: string;
  /** Card border tint. "" = default neutral border. */
  border: string;
  /** Top accent bar (the tactile "note" edge). "" = none. */
  bar: string;
}

export const NOTE_COLORS: NoteColorToken[] = [
  { key: "default", label: "Default", dot: "bg-white ring-1 ring-inset ring-zinc-300", surface: "", border: "", bar: "" },
  { key: "yellow",  label: "Yellow",  dot: "bg-amber-300",  surface: "bg-amber-50",  border: "border-amber-200",  bar: "bg-amber-300" },
  { key: "blue",    label: "Blue",    dot: "bg-sky-300",    surface: "bg-sky-50",    border: "border-sky-200",    bar: "bg-sky-300" },
  { key: "green",   label: "Green",   dot: "bg-emerald-300",surface: "bg-emerald-50",border: "border-emerald-200",bar: "bg-emerald-300" },
  { key: "purple",  label: "Purple",  dot: "bg-violet-300", surface: "bg-violet-50", border: "border-violet-200", bar: "bg-violet-300" },
  { key: "orange",  label: "Orange",  dot: "bg-orange-300", surface: "bg-orange-50", border: "border-orange-200", bar: "bg-orange-300" },
  { key: "pink",    label: "Pink",    dot: "bg-pink-300",   surface: "bg-pink-50",   border: "border-pink-200",   bar: "bg-pink-300" },
  { key: "teal",    label: "Teal",    dot: "bg-teal-300",   surface: "bg-teal-50",   border: "border-teal-200",   bar: "bg-teal-300" },
  { key: "gray",    label: "Gray",    dot: "bg-zinc-300",   surface: "bg-zinc-100/70",border: "border-zinc-200",  bar: "bg-zinc-300" },
];

const NOTE_MAP: Record<NoteColor, NoteColorToken> = NOTE_COLORS.reduce(
  (acc, c) => { acc[c.key] = c; return acc; },
  {} as Record<NoteColor, NoteColorToken>,
);

/** Resolve a note-color token, defaulting to the neutral "default". */
export function noteColor(key: string | null | undefined): NoteColorToken {
  return NOTE_MAP[(key as NoteColor)] ?? NOTE_MAP.default;
}

/* ─── Model ─────────────────────────────────────────────────────────────── */

export interface KanbanColumn {
  id: string;
  name: string;
  color: KanbanColor;
  /** Ordered lead ids placed in this column (personal card order). */
  cardIds: string[];
}

export interface KanbanBoard {
  id: string;
  /** The owning user's staff id — personal isolation scope. */
  ownerUserId: string;
  name: string;
  color: KanbanColor;
  /** The permanent default board can't be deleted (only archived/renamed). */
  isDefault: boolean;
  order: number;
  columns: KanbanColumn[];
  /** PERSONAL sticky-note color per lead id ON THIS BOARD. A lead with no
   *  entry (or "default") renders as the neutral card. Per-board so the same
   *  lead can be a different color on a different personal board. Optional so
   *  boards persisted before this feature stay valid. */
  noteColors?: Record<string, NoteColor>;
  createdAt: string;
  updatedAt: string;
}

/** The whole persisted state for one user. */
export interface KanbanState {
  boards: KanbanBoard[];
  /** Currently selected board id (per user). */
  activeBoardId: string | null;
}

/* ─── Ids + time ─────────────────────────────────────────────────────────── */

export const kUid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const now = () => new Date().toISOString();

/* ─── Default board factory ──────────────────────────────────────────────── */

/** Sensible starter columns for a fresh personal board. These are PERSONAL
 *  labels (not Lead Status). The user owns them the moment the board exists. */
const DEFAULT_COLUMNS: { name: string; color: KanbanColor }[] = [
  { name: "New",         color: "blue" },
  { name: "Contacted",   color: "purple" },
  { name: "Qualified",   color: "indigo" },
  { name: "Follow Up",   color: "orange" },
  { name: "Won",         color: "green" },
  { name: "Lost",        color: "gray" },
];

export function makeDefaultBoard(ownerUserId: string): KanbanBoard {
  const ts = now();
  return {
    id: kUid(),
    ownerUserId,
    name: "My Pipeline",
    color: "blue",
    isDefault: true,
    order: 0,
    columns: DEFAULT_COLUMNS.map((c) => ({ id: kUid(), name: c.name, color: c.color, cardIds: [] })),
    noteColors: {},
    createdAt: ts,
    updatedAt: ts,
  };
}

/** A blank new board (one starter column so it's never empty/broken). */
export function makeBoard(ownerUserId: string, name: string, color: KanbanColor, order: number): KanbanBoard {
  const ts = now();
  return {
    id: kUid(),
    ownerUserId,
    name: name.trim() || "New Board",
    color,
    isDefault: false,
    order,
    columns: [
      { id: kUid(), name: "To Do", color: "blue", cardIds: [] },
      { id: kUid(), name: "In Progress", color: "amber", cardIds: [] },
      { id: kUid(), name: "Done", color: "green", cardIds: [] },
    ],
    noteColors: {},
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Duplicate a board's CONFIGURATION (columns/colors/order) + card memberships
 *  as REFERENCES. Never clones the underlying leads. */
export function duplicateBoard(src: KanbanBoard, order: number): KanbanBoard {
  const ts = now();
  return {
    id: kUid(),
    ownerUserId: src.ownerUserId,
    name: `${src.name} (Copy)`,
    color: src.color,
    isDefault: false,
    order,
    columns: src.columns.map((c) => ({ id: kUid(), name: c.name, color: c.color, cardIds: [...c.cardIds] })),
    // Personal note colors travel with the duplicated layout (references only).
    noteColors: { ...(src.noteColors ?? {}) },
    createdAt: ts,
    updatedAt: ts,
  };
}

/* ─── Note-color helpers (pure) ──────────────────────────────────────────── */

/** Set (or clear, when color === "default") the personal note color for a lead
 *  ON THIS BOARD. Returns a NEW board. Never touches lead business data. */
export function setNoteColor(board: KanbanBoard, leadId: string, color: NoteColor): KanbanBoard {
  const next = { ...(board.noteColors ?? {}) };
  if (color === "default") delete next[leadId];
  else next[leadId] = color;
  return { ...board, noteColors: next, updatedAt: now() };
}

/** The personal note color for a lead on this board ("default" when unset). */
export function noteColorOf(board: KanbanBoard, leadId: string): NoteColor {
  return board.noteColors?.[leadId] ?? "default";
}

/* ─── Placement helpers (pure) ───────────────────────────────────────────── */

/** All lead ids currently placed anywhere on the board. */
export function placedLeadIds(board: KanbanBoard): Set<string> {
  const set = new Set<string>();
  for (const col of board.columns) for (const id of col.cardIds) set.add(id);
  return set;
}

/** Find the column that holds a lead id (or null). */
export function columnOfLead(board: KanbanBoard, leadId: string): KanbanColumn | null {
  return board.columns.find((c) => c.cardIds.includes(leadId)) ?? null;
}

/** The default column new/unplaced leads land in — the first column. */
export function defaultColumnId(board: KanbanBoard): string | null {
  return board.columns[0]?.id ?? null;
}

/** Remove a lead id from every column (used before re-placing / when the lead
 *  is deleted or leaves the user's scope). Returns a NEW board. */
export function withLeadRemoved(board: KanbanBoard, leadId: string): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((c) =>
      c.cardIds.includes(leadId) ? { ...c, cardIds: c.cardIds.filter((id) => id !== leadId) } : c,
    ),
  };
}

/**
 * Reconcile a board against the set of lead ids the user may currently see:
 *   • drop placements for leads that no longer exist / left scope (prune),
 *   • auto-place any authorized lead that has no placement yet into the default
 *     column (so a new lead appears without duplicating anything).
 * Returns { board, changed } — changed=true when a write-back is needed.
 */
export function reconcileBoard(board: KanbanBoard, authorizedLeadIds: Set<string>): { board: KanbanBoard; changed: boolean } {
  let changed = false;

  // 1) Prune placements for leads no longer authorized/visible.
  const prunedColumns = board.columns.map((col) => {
    const kept = col.cardIds.filter((id) => authorizedLeadIds.has(id));
    if (kept.length !== col.cardIds.length) changed = true;
    return kept.length === col.cardIds.length ? col : { ...col, cardIds: kept };
  });

  // 2) Auto-place authorized leads that aren't on the board yet.
  const placed = new Set<string>();
  for (const col of prunedColumns) for (const id of col.cardIds) placed.add(id);
  const unplaced: string[] = [];
  for (const id of authorizedLeadIds) if (!placed.has(id)) unplaced.push(id);

  let columns = prunedColumns;
  if (unplaced.length > 0 && columns.length > 0) {
    changed = true;
    // newest-unplaced first would require lead metadata; keep stable order.
    columns = columns.map((col, i) =>
      i === 0 ? { ...col, cardIds: [...unplaced, ...col.cardIds] } : col,
    );
  }

  if (!changed) return { board, changed: false };
  return { board: { ...board, columns, updatedAt: now() }, changed: true };
}

/**
 * Move a lead within/between columns to a target index. Pure; returns a new
 * board. Only touches personal placement + order — never lead business data.
 */
export function moveCard(
  board: KanbanBoard,
  leadId: string,
  toColumnId: string,
  toIndex: number,
): KanbanBoard {
  const columns = board.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] }));
  // Remove from wherever it is.
  for (const c of columns) {
    const idx = c.cardIds.indexOf(leadId);
    if (idx >= 0) c.cardIds.splice(idx, 1);
  }
  const dest = columns.find((c) => c.id === toColumnId);
  if (dest) {
    const clamped = Math.max(0, Math.min(toIndex, dest.cardIds.length));
    dest.cardIds.splice(clamped, 0, leadId);
  }
  return { ...board, columns, updatedAt: now() };
}

/** Delete a column, moving its cards to a fallback column (never lose cards).
 *  If fallbackColumnId is null, the cards are moved to the first remaining
 *  column. Returns a new board. Refuses to delete the last column. */
export function deleteColumn(board: KanbanBoard, columnId: string, fallbackColumnId?: string | null): KanbanBoard {
  if (board.columns.length <= 1) return board; // keep at least one column
  const target = board.columns.find((c) => c.id === columnId);
  if (!target) return board;
  const remaining = board.columns.filter((c) => c.id !== columnId);
  const fallback =
    (fallbackColumnId && remaining.find((c) => c.id === fallbackColumnId)) || remaining[0];
  const columns = remaining.map((c) =>
    c.id === fallback.id ? { ...c, cardIds: [...c.cardIds, ...target.cardIds] } : c,
  );
  return { ...board, columns, updatedAt: now() };
}
