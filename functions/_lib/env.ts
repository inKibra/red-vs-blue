/** Cloudflare Pages Functions environment bindings for this app. */
export type Env = {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  TOKEN_SECRET: string;
  IP_HASH_SALT: string;

  /**
   * Sender address for OTC + results emails. Must be on a domain onboarded
   * under Cloudflare Email Sending. Optional in dev — if unset (or if the
   * REST credentials below are unset), `sendEmail()` falls back to the
   * `dev_emails` D1 outbox (admin-only viewer at `/dev/email/:id`).
   */
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;

  /**
   * Cloudflare account id + API token for the Email Service REST endpoint.
   * Both required (alongside `EMAIL_FROM_ADDRESS`) to send real email.
   *
   * Pages Functions cannot bind to Send Email directly (Workers-only as of
   * 2026-04), so we call the REST API. Mint a token at:
   *   dash.cloudflare.com → My Profile → API Tokens → Create Token
   * with permission `Account → Email Service → Edit`.
   */
  CF_ACCOUNT_ID?: string;
  CF_EMAIL_API_TOKEN?: string;
};

export type RouteContext = EventContext<Env, string, unknown>;

/** Throw a 500-equivalent if a required secret/binding is missing. */
export function requireEnv(env: Env): asserts env is Env {
  const missing: string[] = [];
  if (!env.DB) missing.push("DB");
  if (!env.ADMIN_PASSWORD) missing.push("ADMIN_PASSWORD");
  if (!env.TOKEN_SECRET) missing.push("TOKEN_SECRET");
  if (!env.IP_HASH_SALT) missing.push("IP_HASH_SALT");
  if (missing.length) {
    throw new Error(`Missing env bindings: ${missing.join(", ")}`);
  }
}
