# Red vs Blue Threshold Poll

Lightweight web app that randomly assigns visitors to one of N versions of the
red/blue threshold problem, records their answers, and shows live aggregate
results to an admin.

Stack:

- **Vite + React + TypeScript** for the SPA frontend.
- **Cloudflare Pages Functions** for the API.
- **Cloudflare D1** (SQLite) for storage.
- HMAC-signed condition tokens (single-use, enforced by DB unique constraint).
- HMAC-signed admin session cookie (HTTP-only, Secure, SameSite=Strict).

## Layout

```
src/                  Frontend SPA (poll + admin dashboard)
shared/               Types + condition + prompt-builder shared FE/BE
functions/api/        Cloudflare Pages Functions (API routes)
functions/_lib/       Backend helpers (token, auth, crypto, db, http)
schema.sql            D1 schema
public/_redirects     SPA fallback (catch-all rewrite to /index.html)
```

## API

Public:

- `GET  /api/poll/status`        — `{ status, closesAt, resultsPublishedAt, totalResponses }`
- `POST /api/poll/assign`        — `{ responseToken, condition, alreadyVoted }`; sticky via signed `rb_assignment` cookie
- `POST /api/poll/answer`        — per-click partial save (each choice / confidence change)
- `POST /api/poll/submit`        — finalize a response (requires `responseToken`); returns `{ ok, totalResponses }`
- `POST /api/poll/subscribe`     — `{ responseToken, email }` → issues OTC and emails it
- `POST /api/poll/verify-email`  — `{ responseToken, code }` → marks email verified and sets `rb_preview` cookie
- `GET  /api/poll/results`       — public when published; subscribers (via `rb_preview`) get a live preview otherwise
- `GET  /og.png`                 — dynamic Open Graph image (neutral teaser; no frame, no result)

Admin (cookie auth):

- `POST /api/admin/login`        — `{ password }` → sets cookie
- `POST /api/admin/logout`
- `GET  /api/admin/session`      — `{ authenticated }`
- `GET  /api/admin/results`      — aggregates + cross-tabs
- `POST /api/admin/end-poll`
- `POST /api/admin/reopen-poll`
- `POST /api/admin/set-close`        — `{ closesAt: ISO | null }` to schedule or clear close time
- `POST /api/admin/publish-results`  — sets `results_published_at` and notifies verified subscribers (idempotent)
- `GET  /api/admin/export.csv`       — full response dump; `?include=all` to include partial / unsubmitted rows

Email outbox (admin-authenticated; populated whenever `sendEmail()` falls
back to D1 — i.e., when either the `EMAIL` binding or `EMAIL_FROM_ADDRESS`
is missing in any environment):

- `GET  /dev/email/:id`          — view a rendered email by row id
- `GET  /dev/email/latest`       — jump to the most recently rendered email

These routes require the admin session cookie. In production with a
correctly configured `EMAIL` binding + `EMAIL_FROM_ADDRESS`, no rows are
ever written, so the routes return 404 even to admins.

## Local dev

```bash
npm install
cp .dev.vars.example .dev.vars     # then edit secrets
npm run db:init:local              # create local D1 tables
npm run build                      # produce dist/
npx wrangler pages dev dist        # serves at http://127.0.0.1:8788
```

For frontend-only iteration, `npm run dev` runs Vite's dev server, but API
routes will not be available — use `wrangler pages dev` to test end-to-end.

## Deploy to Cloudflare Pages

Steps are ordered so the first deploy ships with all bindings + secrets in
place. Email features need both the Email Service domain onboarded **and**
`EMAIL_FROM_ADDRESS` set before the build that ships them — otherwise the
first deployment will silently fall back to writing emails to `dev_emails`
until you redeploy.

1. **Create the Pages project** (one-time):

   ```bash
   npx wrangler login
   npx wrangler pages project create red-vs-blue --production-branch=main
   ```

   Or do this from the dashboard. Subsequent `wrangler pages secret put` and
   `wrangler pages deploy` commands target this project by name.

2. **Create the D1 database** and paste the returned `database_id` into
   `wrangler.toml`:

   ```bash
   npx wrangler d1 create red-vs-blue
   ```

3. **Apply the schema** to the remote D1:

   ```bash
   npm run db:init:remote
   ```

4. **Onboard the sending domain** for Cloudflare Email Service. In the
   dashboard: **Email Sending → Onboard Domain**, pick your zone, accept the
   DNS records. Cloudflare provisions DKIM/SPF/DMARC on
   `cf-bounce.<your-domain>` automatically. Wait until status reads
   *Verified* before continuing — `env.EMAIL.send()` will fail otherwise.

5. **Push secrets** to your Pages project (do this once):

   ```bash
   npx wrangler pages secret put ADMIN_PASSWORD     --project-name=red-vs-blue
   npx wrangler pages secret put TOKEN_SECRET       --project-name=red-vs-blue
   npx wrangler pages secret put IP_HASH_SALT       --project-name=red-vs-blue
   npx wrangler pages secret put EMAIL_FROM_ADDRESS --project-name=red-vs-blue
   # optional, defaults to "The Threshold Study":
   npx wrangler pages secret put EMAIL_FROM_NAME    --project-name=red-vs-blue
   ```

   - `ADMIN_PASSWORD`     — required to log into `/admin`.
   - `TOKEN_SECRET`       — HMAC key for response tokens AND admin session cookies.
                            Use a long random string (e.g. `openssl rand -base64 48`).
   - `IP_HASH_SALT`       — salt for SHA-256 of IP / user-agent. Random string.
   - `EMAIL_FROM_ADDRESS` — sender for OTC + results emails. Must be on the
                            domain you onboarded in step 4. If unset, `sendEmail()`
                            falls back to the `dev_emails` D1 table.

6. **Build and deploy**:

   ```bash
   npm run build
   npm run pages:deploy
   ```

   (Or hook the GitHub repo to a Pages project with build command
   `npm run build` and output directory `dist`. The `[[send_email]]`
   binding in `wrangler.toml` is wired automatically on deploy.)

## Conditions

`shared/conditions.ts` is the single source of truth. Each participant is
randomly assigned across **4 dimensions** (4 × 2 × 4 × 2 = 64 cells):

| Dimension                | Values                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `mechanismFrame`         | `original`, `neutral_outcome`, `individual_payoff`, `full_payoff_table`            |
| `salienceCondition`      | `children_infirm_absent`, `children_infirm_present`                                |
| `labelCondition`         | `red_blue_original`, `red_blue_swapped`, `ab`, `one_two`                           |
| `orderCondition`         | `success_first`, `failure_first`                                                   |

Internal names always use **`threshold` / `safe`**, never morally loaded labels.
The displayed labels are derived from `labelCondition` and stored separately on
each `responses` row so the original wording can be reconstructed.

## Anti-duplicate

Light, non-blocking defenses only:

- Server-side `rb_voted=1` cookie set on submit (6-month lifetime).
- SHA-256 of `IP + IP_HASH_SALT` and `UserAgent + IP_HASH_SALT` stored per
  response. Raw IPs are never stored.
- Single-use response tokens enforced by `responses.token_id UNIQUE`.

The admin can filter likely duplicates using the IP hash column in the CSV
export.
