import type { RouteContext } from "./_lib/env";
import { requireEnv } from "./_lib/env";
import { verifyUnsubscribeLink } from "./_lib/unsubscribe-link";

type UnsubscribeRow = {
  token_id: string;
  email: string;
  unsubscribed_at: string | null;
};

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" } as const;

function jsonResponse(ok: boolean, status: 200 | 400): Response {
  return new Response(ok ? '{"ok":true}' : '{"ok":false}', {
    status,
    headers: JSON_HEADERS,
  });
}

function htmlPage(state: "success" | "failure"): Response {
  const isSuccess = state === "success";
  const headline = isSuccess ? "Unsubscribed." : "Link expired.";
  const body = isSuccess
    ? `<p>You will no longer receive emails from The Threshold Study, including the final results.</p>
    <p class="muted">If this was a mistake, just <a href="/results">visit your results page</a> and request a new email link — it will quietly resubscribe you.</p>`
    : `<p>This unsubscribe link is invalid or has expired. If you want to stop receiving emails, reply to the most recent message and we'll remove you manually.</p>`;

  return new Response(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Unsubscribed · The Threshold Study</title>
  <style>
    :root { color-scheme: light; }
    body { background: #f4f1e8; color: #171a16; font-family: 'Inria Serif', Iowan Old Style, Georgia, serif; margin: 0; padding: 0; min-height: 100vh; display: grid; place-items: center; }
    main { background: #fbf8ef; border: 1px solid #171a1626; padding: 36px 32px; max-width: 520px; width: calc(100% - 32px); }
    .eyebrow { font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #73796e; margin: 0 0 14px; }
    h1 { margin: 0 0 16px; font-weight: 300; font-size: 32px; letter-spacing: -0.02em; line-height: 1.05; }
    p { margin: 0 0 12px; font-size: 16px; line-height: 1.55; color: #41433a; }
    a { color: #314b3f; }
    .muted { color: #73796e; font-size: 13px; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">The Threshold Study</p>
    <h1>${headline}</h1>
    ${body}
  </main>
</body>
</html>`, {
    status: 200,
    headers: HTML_HEADERS,
  });
}

function failureResponse(method: "GET" | "POST"): Response {
  return method === "GET" ? htmlPage("failure") : jsonResponse(false, 400);
}

async function unsubscribe(ctx: RouteContext, method: "GET" | "POST"): Promise<Response> {
  const key = new URL(ctx.request.url).searchParams.get("key");
  if (!key) return failureResponse(method);

  const payload = await verifyUnsubscribeLink(ctx.env.TOKEN_SECRET, key);
  if (!payload) return failureResponse(method);

  const row = await ctx.env.DB.prepare(
    `SELECT token_id, email, unsubscribed_at FROM responses WHERE token_id = ? AND email = ?`,
  )
    .bind(payload.id, payload.email)
    .first<UnsubscribeRow>();

  if (!row) {
    console.warn("Unsubscribe row lookup failed:", payload.id);
    return failureResponse(method);
  }

  if (!row.unsubscribed_at) {
    await ctx.env.DB.prepare(
      `UPDATE responses
       SET unsubscribed_at = datetime('now'), updated_at = datetime('now')
       WHERE token_id = ? AND email = ?`,
    )
      .bind(payload.id, payload.email)
      .run();
  }

  return method === "GET" ? htmlPage("success") : jsonResponse(true, 200);
}

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET" && ctx.request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  requireEnv(ctx.env);
  return unsubscribe(ctx, ctx.request.method);
};
