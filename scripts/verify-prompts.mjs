#!/usr/bin/env node
/**
 * Renders every (mechanismFrame × orderCondition) pair through buildPrompt
 * and asserts:
 *
 *   1. Each rendered prompt contains the literal string "50%" (the explicit
 *      threshold definition).
 *   2. Each rendered prompt does NOT contain the older bare phrase
 *      "clears the threshold" (which we no longer use without an inline
 *      "more than 50%" qualifier in the same clause).
 *
 * Run: node --import tsx scripts/verify-prompts.mjs
 * Exits non-zero if any prompt fails the checks.
 */
import {
  buildPrompt,
  labelsFor,
} from "../shared/conditions.ts";
import {
  MECHANISM_FRAMES,
  ORDER_CONDITIONS,
  LABEL_CONDITIONS,
} from "../shared/types.ts";

let failures = 0;
const sampleLabels = LABEL_CONDITIONS[0]; // red_blue_original — representative

for (const frame of MECHANISM_FRAMES) {
  for (const order of ORDER_CONDITIONS) {
    const { displayedThresholdLabel, displayedSafeLabel } = labelsFor(sampleLabels);
    const { promptText } = buildPrompt(
      frame,
      "children_infirm_absent", // salience doesn't affect the threshold check
      order,
      displayedThresholdLabel,
      displayedSafeLabel,
    );
    const has50 = promptText.includes("50%");
    const hasOldPhrase = /clears the threshold|fails the threshold/i.test(
      promptText,
    );
    const ok = has50 && !hasOldPhrase;
    const tag = `${frame.padEnd(20)} ${order.padEnd(15)}`;
    if (ok) {
      console.log(`OK  ${tag}`);
    } else {
      failures++;
      console.log(`FAIL ${tag}  has50=${has50} hasOldPhrase=${hasOldPhrase}`);
      console.log(`     ${promptText}`);
    }
  }
}

console.log();
if (failures === 0) {
  console.log("All prompts verified. Every frame × order pair includes \"50%\".");
} else {
  console.log(`${failures} failures.`);
  process.exit(1);
}
