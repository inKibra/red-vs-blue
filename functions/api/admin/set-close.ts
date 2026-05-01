import { isAdminAuthenticated } from "../../_lib/auth";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";
import { setPollClosesAt } from "../../_lib/poll";

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);
  if (!(await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET))) {
    return error(401, "Not authenticated.");
  }

  let body: { closesAt?: unknown };
  try {
    body = (await ctx.request.json()) as { closesAt?: unknown };
  } catch {
    return error(400, "Invalid JSON body.");
  }

  const raw = body.closesAt;
  if (raw === null || raw === undefined) {
    await setPollClosesAt(ctx.env, null);
    return json({ ok: true, closesAt: null });
  }
  if (typeof raw !== "string") {
    return error(400, "closesAt must be a string ISO timestamp or null.");
  }
  const d = new Date(raw);
  if (isNaN(d.valueOf())) return error(400, "Invalid date.");
  const iso = d.toISOString();
  await setPollClosesAt(ctx.env, iso);
  return json({ ok: true, closesAt: iso });
};
