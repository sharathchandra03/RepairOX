/* Review analytics for Field Activity (pure, tested): ranking per Ninja and the team trend. */
export interface ReviewRow { ninjaId: string; rating: number; channel: string; ym: string; /** the trip has a ticket */ hasTicket: boolean; comment: string | null; at: string }
export interface RankRow { ninjaId: string; count: number; avg: number; five: number; verifiedFive: number; dist: number[] /* index 0 = 1★ */ }
export const isVerifiedFive = (r: ReviewRow) => r.rating === 5 && r.channel !== "ninja_app" && r.hasTicket;
/** Best average first; ties by number of reviews. Only the given month. */
export function rankNinjas(rows: ReviewRow[], ym: string): RankRow[] {
  const by = new Map<string, ReviewRow[]>();
  for (const r of rows) if (r.ym === ym) { const a = by.get(r.ninjaId) ?? []; a.push(r); by.set(r.ninjaId, a); }
  return [...by].map(([ninjaId, rs]) => ({
    ninjaId, count: rs.length, avg: Math.round((rs.reduce((t, x) => t + x.rating, 0) / rs.length) * 10) / 10,
    five: rs.filter((x) => x.rating === 5).length, verifiedFive: rs.filter(isVerifiedFive).length,
    dist: [1, 2, 3, 4, 5].map((s) => rs.filter((x) => x.rating === s).length),
  })).sort((a, b) => b.avg - a.avg || b.count - a.count);
}
/** Team average and count for each of the given months (oldest first). Months with no reviews have avg null. */
export function trendByMonth(rows: ReviewRow[], months: string[]): { ym: string; count: number; avg: number | null }[] {
  return months.map((ym) => { const rs = rows.filter((r) => r.ym === ym); return { ym, count: rs.length, avg: rs.length ? Math.round((rs.reduce((t, x) => t + x.rating, 0) / rs.length) * 10) / 10 : null }; });
}
