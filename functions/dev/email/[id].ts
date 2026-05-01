import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { isAdminAuthenticated } from "../../_lib/auth";

/**
 * Email outbox viewer.
 *
 * The fallback path in `sendEmail()` writes rendered emails to the
 * `dev_emails` table whenever the Email Service binding or
 * `EMAIL_FROM_ADDRESS` is missing. That fallback fires in *any* environment
 * where the binding/secret isn't configured — including a misconfigured
 * production deploy.
 *
 * If those rows include OTCs, anyone hitting an enumerable URL like
 * `/dev/email/latest` could read codes out of the outbox. So this route
 * requires the admin session cookie before serving anything. In dev,
 * log into `/admin` once with the dev password and the route works.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  requireEnv(ctx.env);

  if (!(await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET))) {
    return new Response("Unauthorized. Log into /admin first.", {
      status: 401,
    });
  }

  const rawId = (ctx.params as { id?: string }).id;
  if (!rawId) return new Response("Missing id", { status: 400 });

  const row =
    rawId === "latest"
      ? await ctx.env.DB.prepare(
          `SELECT html, subject, to_addr, created_at
           FROM dev_emails ORDER BY created_at DESC LIMIT 1`,
        ).first<DevEmailRow>()
      : await ctx.env.DB.prepare(
          `SELECT html, subject, to_addr, created_at
           FROM dev_emails WHERE id = ?`,
        )
          .bind(rawId)
          .first<DevEmailRow>();

  if (!row) return new Response("No email found.", { status: 404 });

  // Wrap the rendered HTML in a thin chrome that shows the email's metadata
  // (to / subject / sent-at) so it doesn't look like a regular page.
  const chrome = `
<div style="font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #888; padding: 12px 18px; background: #1a1a1a; color: #ccc; display: grid; grid-template-columns: auto 1fr; column-gap: 18px; row-gap: 4px;">
  <div>To</div><div>${escapeHtml(row.to_addr)}</div>
  <div>Subject</div><div>${escapeHtml(row.subject)}</div>
  <div>Sent</div><div>${escapeHtml(row.created_at)} UTC · OUTBOX (no DNS)</div>
</div>`;

  return new Response(chrome + row.html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};

type DevEmailRow = {
  html: string;
  subject: string;
  to_addr: string;
  created_at: string;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
