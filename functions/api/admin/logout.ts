import { clearAdminCookie } from "../../_lib/auth";
import type { RouteContext } from "../../_lib/env";
import { json, methodNotAllowed } from "../../_lib/http";

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  return json({ ok: true }, { headers: { "Set-Cookie": clearAdminCookie(ctx.request) } });
};
