#!/usr/bin/env node
/**
 * Render the PreliminaryEmail template to an HTML file for inspection.
 *
 *   node --import tsx scripts/preview-preliminary.mjs
 *
 * Numbers below mirror the live aggregate query in
 * functions/api/admin/send-preliminary.ts so the rendered file matches
 * what a real recipient would see when the blast goes out today.
 */
import { render } from "@react-email/render";
import { createElement } from "react";
import { writeFileSync } from "node:fs";
import PreliminaryEmail from "../functions/_lib/templates/PreliminaryEmail.tsx";

// Live snapshot from prod D1 (read-only) — these mirror what the admin
// endpoint computes at send time, so the preview renders the same numbers
// recipients will see right now.
const props = {
  totalResponses: 223,
  personalChoiceThresholdPct: 50.7,
  dependentRecommendationThresholdPct: 44.4,
  averageConfidence: 4.23,
  // Live snapshot from prod D1 byFrame query (read-only):
  // original 67.3 (n=N), neutral 49.0, individual_payoff 55.9, full_payoff 36.8
  frameSwing: [
    { label: "Original",          pct: 67.3, n: 49 },
    { label: "Spare prose",       pct: 49.0, n: 51 },
    { label: "Individual payoff", pct: 55.9, n: 59 },
    { label: "Payoff table",      pct: 36.8, n: 38 },
  ],
  shareUrl: "https://mayliveforever.com/?ref=EXAMPLE_SHARE_CODE",
  caseStudyUrl: "https://mayliveforever.com/case-study",
  unsubscribeUrl:
    "https://mayliveforever.com/unsubscribe?key=EXAMPLE_SIGNED_TOKEN",
};

const html = await render(createElement(PreliminaryEmail, props));
const text = await render(createElement(PreliminaryEmail, props), {
  plainText: true,
});

const out = "/tmp/preliminary-email-preview.html";
writeFileSync(out, html, "utf8");
writeFileSync("/tmp/preliminary-email-preview.txt", text, "utf8");

console.log(`HTML  -> ${out}  (${html.length} bytes)`);
console.log(`TEXT  -> /tmp/preliminary-email-preview.txt  (${text.length} bytes)`);
console.log("");
console.log("=== PLAIN-TEXT VERSION ===");
console.log(text);
