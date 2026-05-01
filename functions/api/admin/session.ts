import { isAdminAuthenticated } from "../../_lib/auth";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { json, methodNotAllowed } from "../../_lib/http";

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  requireEnv(ctx.env);
  const ok = await isAdminAuthenticated(ctx.request, ctx.env.TOKEN_SECRET);
  return json({ authenticated: ok });
};
