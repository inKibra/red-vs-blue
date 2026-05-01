#!/usr/bin/env node
/**
 * One-off smoke test: render both production email templates and send
 * each via Cloudflare's Email Service REST API.
 *
 * Reads CF_ACCOUNT_ID + CF_EMAIL_API_TOKEN from env (or hardcoded args).
 * Targets `npm run --workspace tsx ...` style invocation isn't necessary —
 * react-email components are tsx but we execute via tsx loader.
 *
 *   node --import tsx scripts/email-smoke.mjs <to-address>
 */
import { render } from "@react-email/render";
import { createElement } from "react";
import OtcEmail from "../functions/_lib/templates/OtcEmail.tsx";
import ResultsEmail from "../functions/_lib/templates/ResultsEmail.tsx";

const TO = process.argv[2];
if (!TO) {
  console.error("Usage: node --import tsx scripts/email-smoke.mjs <to-address>");
  process.exit(2);
}
const ACCT = process.env.CF_ACCOUNT_ID;
const TOKEN = process.env.CF_EMAIL_API_TOKEN;
const FROM = process.env.EMAIL_FROM_ADDRESS || "noreply@mayliveforever.com";
const FROM_NAME = process.env.EMAIL_FROM_NAME || "The Threshold Study";
if (!ACCT || !TOKEN) {
  console.error("Need CF_ACCOUNT_ID and CF_EMAIL_API_TOKEN in env.");
  process.exit(2);
}

async function send({ subject, element }) {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  console.log(`  html type=${typeof html} len=${(html||'').length}; text type=${typeof text} len=${(text||'').length}`);
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/email/sending/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: TO,
      from: FROM,
      subject,
      html,
      text,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: !!body.success, body };
}

const cases = [
  {
    label: "OTC verification",
    subject: "[smoke 1/2] Confirm your email — The Threshold Study",
    element: createElement(OtcEmail, { code: "428193", domain: "mayliveforever.com" }),
  },
  {
    label: "Results published",
    subject: "[smoke 2/2] The results are in — The Threshold Study",
    element: createElement(ResultsEmail, {
      totalResponses: 247,
      thresholdPercent: 38,
      safePercent: 62,
      averageConfidence: 3.4,
      publicThresholdPercent: 51,
      dependentThresholdPercent: 27,
      resultsUrl: "https://mayliveforever.com/results",
    }),
  },
];

for (const c of cases) {
  const r = await send(c);
  console.log(
    `${c.label.padEnd(22)}  status=${r.status}  ok=${r.ok}  ${
      r.ok ? "delivered/queued" : JSON.stringify(r.body.errors || r.body)
    }`,
  );
}
