export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, { status });
}

export function methodNotAllowed(allow: string[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: allow.join(", ") },
  });
}
