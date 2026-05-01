/**
 * Cookie helpers shared between auth (admin session) and the public poll
 * (sticky condition + voted markers).
 */

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/**
 * Build a Set-Cookie value. Omits `Secure` for plain-HTTP local dev so
 * cookies work under `wrangler pages dev` on http://127.0.0.1.
 */
export function setCookie(
  name: string,
  value: string,
  opts: {
    requestUrl: string;
    maxAgeSeconds: number;
    httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    path?: string;
  },
): string {
  const isHttps = opts.requestUrl.startsWith("https://");
  const parts = [
    `${name}=${value}`,
    `Path=${opts.path ?? "/"}`,
    `Max-Age=${opts.maxAgeSeconds}`,
    `SameSite=${opts.sameSite ?? "Lax"}`,
  ];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (isHttps) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(
  name: string,
  opts: { requestUrl: string; path?: string; sameSite?: "Strict" | "Lax" | "None" } = {
    requestUrl: "https://",
  },
): string {
  return setCookie(name, "", { ...opts, maxAgeSeconds: 0 });
}
