import { ImageResponse } from "workers-og";
import type { RouteContext } from "./_lib/env";
import { requireEnv } from "./_lib/env";
import { getPollSettings } from "./_lib/poll";

/**
 * Open Graph image for the Threshold Study.
 *
 * Design constraints (intentional):
 *  - Reveals NO frame text. The dilemma's wording is the experiment's
 *    independent variable; including it in the OG would prime every
 *    recipient and contaminate the survey.
 *  - Reveals NO outcome. The OG must drive participation, not consumption.
 *    A reader who sees the result on a card has no reason to click.
 *  - Reads as a teaser: a question, no answer.
 *
 * Satori (workers-og) is strict about CSS: every multi-child container
 * must declare `display: flex`. Children here are leaf text nodes.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  if (ctx.request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET" },
    });
  }
  requireEnv(ctx.env);

  const settings = await getPollSettings(ctx.env);
  const aggRow = await ctx.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM responses WHERE submitted_at IS NOT NULL`,
  ).first<{ total: number }>();
  const total = aggRow?.total ?? 0;

  const isClosed = settings.status === "closed";
  const html = render({ total, isClosed });

  // The OG image is dynamic: response count + lifecycle state both move.
  // Override Pages' default 1-year `immutable` cache so scrapers don't lock
  // in the very first version forever. 60s edge cache absorbs scraper bursts
  // without freezing the count for long; satori render is ~50ms anyway.
  const img = new ImageResponse(html, { width: 1200, height: 630 });
  return new Response(img.body, {
    status: img.status,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
};

const fontSerif = "'Inria Serif', Georgia, serif";
const fontMono = "'JetBrains Mono', ui-monospace, monospace";

const ink = "#171a16";
const paper = "#f4f1e8";
const accent = "#8fa38d";
const muted = "#9da89b";

function leaf(text: string, style: string): string {
  return `<div style="display:flex; ${style}">${escapeHtml(text)}</div>`;
}

function render({
  total,
  isClosed,
}: {
  total: number;
  isClosed: boolean;
}): string {
  // Footer is the explicit CTA. It carries (a) cost framing — 60s + anonymous,
  // (b) live social proof when there are responses, and (c) the imperative.
  // The hero question above ("What would you press?") is the curiosity hook;
  // this line is the call to action. Adaptive per lifecycle state:
  let footer: string;
  if (isClosed) {
    footer = "Voting closed  ·  See the results →";
  } else if (total === 0) {
    footer = "60 seconds  ·  Anonymous  ·  Be the first →";
  } else if (total === 1) {
    footer = "60 seconds  ·  Anonymous  ·  1 has answered  ·  Add yours →";
  } else {
    footer = `60 seconds  ·  Anonymous  ·  ${total.toLocaleString()} have answered  ·  Add yours →`;
  }

  // Single-text leaves only; no nested multi-child flex.
  return (
    `<div style="display:flex; flex-direction:column; width:1200px; height:630px; background:${ink}; color:${paper}; padding:72px 80px; font-family:${fontSerif};">` +
      leaf(
        "The Threshold Study",
        `font-family:${fontMono}; font-size:18px; letter-spacing:0.22em; text-transform:uppercase; color:${muted};`,
      ) +
      `<div style="display:flex; flex-grow:1;"></div>` +
      // The teaser. One stark question, no content reveal.
      leaf(
        "Two buttons.",
        `font-size:128px; line-height:0.98; font-weight:300; letter-spacing:-0.05em; color:${paper};`,
      ) +
      leaf(
        "One choice.",
        `font-size:128px; line-height:0.98; font-weight:300; letter-spacing:-0.05em; color:${paper};`,
      ) +
      leaf(
        "What would you press?",
        `font-size:36px; font-style:italic; color:${accent}; letter-spacing:-0.015em; margin-top:28px;`,
      ) +
      // Lift the rule + footer off the bottom edge so the social-proof line
      // is part of the read, not a footer afterthought.
      `<div style="display:flex; height:56px;"></div>` +
      `<div style="display:flex; width:120px; height:1px; background:${accent}; margin-bottom:20px;"></div>` +
      leaf(
        footer,
        `font-family:${fontMono}; font-size:30px; letter-spacing:0.14em; text-transform:uppercase; color:${paper};`,
      ) +
    `</div>`
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
