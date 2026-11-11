/* RepairOX — safe Google Maps short-link resolution helpers (pure).
   The server follows a short link's redirects ONLY across Google map hosts, over
   HTTPS, so the endpoint can never be used to fetch arbitrary URLs (SSRF). */

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);

/** A host the resolver may contact or be redirected to. */
export function isAllowedMapsHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (SHORT_HOSTS.has(h)) return true;
  // google.com / google.co.in / maps.google.com / consent.google.com …
  return /(^|\.)google\.(com|co\.[a-z]{2}|[a-z]{2})$/.test(h);
}

/** Only a short link may START a resolution (never an arbitrary google URL). */
export function isShortMapsLink(raw: string): boolean {
  try {
    const u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
    const h = u.hostname.toLowerCase();
    return u.protocol === "https:" && (h === "maps.app.goo.gl" || (h === "goo.gl" && u.pathname.startsWith("/maps")) || h === "g.co");
  } catch { return false; }
}

/** Google sometimes bounces through consent.google.com?continue=<real url>. */
export function unwrapConsent(url: URL): URL {
  if (url.hostname.toLowerCase().startsWith("consent.") ) {
    const cont = url.searchParams.get("continue");
    if (cont) { try { return new URL(cont); } catch { /* keep */ } }
  }
  return url;
}

/** Validate + normalise one redirect hop. Returns null when it must not be followed. */
export function nextHop(location: string, base: URL): URL | null {
  let u: URL;
  try { u = unwrapConsent(new URL(location, base)); } catch { return null; }
  if (u.protocol !== "https:" || !isAllowedMapsHost(u.hostname)) return null;
  return u;
}
