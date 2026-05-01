import type { StatusResponse } from "../../../shared/types";
import type { RouteContext } from "../../_lib/env";
import { requireEnv } from "../../_lib/env";
import { json, methodNotAllowed } from "../../_lib/http";
import { getPollSettings } from "../../_lib/poll";

export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") return methodNotAllowed(["GET"]);
  requireEnv(ctx.env);

  const settings = await getPollSettings(ctx.env);
  // Count anyone who started a response (any row in `responses`). A row is
  // created on the first answer click via per-click partial save, so this is
  // "people who clicked at least once," not just submitters. The OG image
  // and aggregate views (admin, results, og.png) still gate on submitted_at.
  const countRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM responses`,
  ).first<{ n: number }>();

  const body: StatusResponse = {
    status: settings.status,
    closesAt: settings.closesAt,
    resultsPublishedAt: settings.resultsPublishedAt,
    totalResponses: countRow?.n ?? 0,
  };
  return json(body, { headers: { "Cache-Control": "public, max-age=10" } });
};
