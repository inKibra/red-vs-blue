import { checkAdminPassword, issueAdminCookie } from "../../_lib/auth";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { error, json, methodNotAllowed } from "../../_lib/http";

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  requireEnv(ctx.env);

  let body: { password?: unknown };
  try {
    body = (await ctx.request.json()) as { password?: unknown };
  } catch {
    return error(400, "Invalid JSON body.");
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!checkAdminPassword(password, ctx.env.ADMIN_PASSWORD)) {
    return error(401, "Invalid password.");
  }
  const cookie = await issueAdminCookie(ctx.request, ctx.env.TOKEN_SECRET);
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
};
