import type { RouteContext } from "./_lib/env";

/**
 * Rewrites `og:image` / `og:image:secure_url` / `twitter:image` meta on every
 * HTML response to include a daily UTC cache-busting query param.
 *
 * Why: Twitter (X) caches OG images by `og:image` URL essentially forever and
 * has deprecated the public card validator. With a static URL the very first
 * scrape's image bytes get served to every future viewer of every tweet. By
 * rotating the URL on a daily cadence, every share posted on a new UTC day
 * forces a fresh scrape which picks up the live response count baked into the
 * image. Existing tweets are still cached on Twitter's side — they only refresh
 * after Twitter's own background sweep (~7d) or a delete + repost.
 *
 * The query param is consumed only by Twitter/iMessage/Slack as a cache key —
 * `og.png` itself ignores unknown query params, so the same bytes are served.
 *
 * Non-HTML responses (api/json, og.png itself, static assets) pass through
 * unchanged via the content-type guard.
 */
export const onRequest = async (ctx: RouteContext): Promise<Response> => {
  const response = await ctx.next();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const v = dayBucket();
  return new HTMLRewriter()
    .on(
      'meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"]',
      {
        element(el) {
          const c = el.getAttribute("content");
          if (!c) return;
          const sep = c.includes("?") ? "&" : "?";
          el.setAttribute("content", `${c}${sep}v=${v}`);
        },
      },
    )
    .transform(response);
};

function dayBucket(): string {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`
  );
}
