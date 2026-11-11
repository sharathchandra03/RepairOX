import { NextResponse } from "next/server";
import { requireUser } from "@/lib/account-security";
import { isShortMapsLink, nextHop, isAllowedMapsHost } from "@/lib/maps-resolve";

export const dynamic = "force-dynamic";

/* POST /api/maps/resolve  { url }  →  { ok, finalUrl }
   Expands a Google Maps SHORT link (maps.app.goo.gl) so the app can read its
   coordinates. Signed-in users only. Starts only from a short link and follows
   redirects ONLY across Google map hosts over HTTPS (max 5 hops, 6s total, no
   body read). Returns the final URL; nothing else from the remote is exposed. */
export async function POST(req: Request) {
  const guard = await requireUser(req);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  let body: { url?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 }); }
  const raw = typeof body.url === "string" ? body.url.trim() : "";
  if (!raw || raw.length > 600 || !isShortMapsLink(raw)) {
    return NextResponse.json({ ok: false, error: "Only Google Maps short links can be resolved." }, { status: 400 });
  }

  let current = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current.toString(), {
        method: "GET", redirect: "manual", signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; RepairOX/1.0)", accept: "text/html" },
      });
      try { await res.body?.cancel(); } catch { /* ignore */ }
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = nextHop(loc, current);
        if (!next) return NextResponse.json({ ok: false, error: "The link redirects somewhere that isn't Google Maps." }, { status: 422 });
        current = next;
        continue;
      }
      break; // reached a non-redirect page
    }
    if (!isAllowedMapsHost(current.hostname)) return NextResponse.json({ ok: false, error: "Unsupported link." }, { status: 422 });
    return NextResponse.json({ ok: true, finalUrl: current.toString() });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't open the link right now." }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
