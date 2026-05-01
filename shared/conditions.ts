import {
  LABEL_CONDITIONS,
  MECHANISM_FRAMES,
  ORDER_CONDITIONS,
  SALIENCE_CONDITIONS,
  type AssignedCondition,
  type LabelCondition,
  type MechanismFrame,
  type OrderCondition,
  type SalienceCondition,
} from "./types";

/**
 * Map a label condition to displayed labels.
 * `displayedThresholdLabel` is the label printed where the original wording
 * would say "blue" (the option that triggers the threshold mechanism).
 * `displayedSafeLabel` is where the original wording would say "red".
 */
export function labelsFor(label: LabelCondition): {
  displayedThresholdLabel: string;
  displayedSafeLabel: string;
} {
  switch (label) {
    case "red_blue_original":
      return { displayedThresholdLabel: "blue", displayedSafeLabel: "red" };
    case "red_blue_swapped":
      // The threshold role is now visually red; safe role is visually blue.
      return { displayedThresholdLabel: "red", displayedSafeLabel: "blue" };
    case "ab":
      return { displayedThresholdLabel: "Button A", displayedSafeLabel: "Button B" };
    case "one_two":
      return { displayedThresholdLabel: "Button 1", displayedSafeLabel: "Button 2" };
  }
}

const SALIENCE_LINE =
  "Some people may not understand the question because they are too young, too old, " +
  "confused, panicked, or otherwise incapable of reasoning through the rules.";

// Threshold definition is the same across every frame: a strict majority
// (more than 50% of voters). Each clause embeds the threshold directly so
// it reads correctly regardless of order, and so participants in different
// frame conditions all see the same numeric criterion.
function successClause(t: string, _s: string): string {
  return `If more than 50% of people press ${t}, everyone survives.`;
}
function failureClause(t: string, s: string): string {
  return `If 50% or fewer press ${t}, ${t} voters die and ${s} voters survive.`;
}

function orderedClauses(order: OrderCondition, t: string, s: string): string {
  return order === "success_first"
    ? `${successClause(t, s)} ${failureClause(t, s)}`
    : `${failureClause(t, s)} ${successClause(t, s)}`;
}

/** Build the scenario prompt for the given condition. */
export function buildPrompt(
  frame: MechanismFrame,
  salience: SalienceCondition,
  order: OrderCondition,
  thresholdLabel: string,
  safeLabel: string,
): { promptText: string; promptIsHtml: boolean } {
  const t = thresholdLabel;
  const s = safeLabel;

  let body = "";
  let isHtml = false;

  switch (frame) {
    case "original": {
      // Spec wording, with the failure clause now self-contained instead of
      // referencing "that threshold" (which broke under failure_first order).
      const success = `If more than 50% of people press the ${t} button, everyone survives.`;
      const failure = `If 50% or fewer press the ${t} button, only people who pressed the ${s} button survive.`;
      const clauses =
        order === "success_first" ? `${success} ${failure}` : `${failure} ${success}`;
      body =
        `Everyone in the world has to take a private vote by pressing a ${s} or ${t} button. ` +
        clauses;
      break;
    }
    case "neutral_outcome": {
      body =
        `Everyone privately presses a ${s} or ${t} button. ` +
        orderedClauses(order, t, s);
      break;
    }
    case "individual_payoff": {
      // Threshold spec embedded in the success clause; the safe clause is
      // outcome-independent so it doesn't need to mention the threshold.
      const success = `${t} voters survive only if more than 50% of voters press ${t}.`;
      const failure = `${s} voters survive either way.`;
      const clauses =
        order === "success_first" ? `${success} ${failure}` : `${failure} ${success}`;
      body = `Everyone privately presses a ${s} or ${t} button. ${clauses}`;
      break;
    }
    case "full_payoff_table": {
      isHtml = true;
      // Row labels carry the threshold definition explicitly so the table
      // doesn't depend on the participant inferring what "clears" means.
      const intro = `Everyone privately presses a ${s} or ${t} button. The payoff table:`;
      const rowSuccess = `<tr><td>More than 50% press ${t}</td><td>Survives</td><td>Survives</td></tr>`;
      const rowFailure = `<tr><td>50% or fewer press ${t}</td><td>Dies</td><td>Survives</td></tr>`;
      const rows =
        order === "success_first" ? rowSuccess + rowFailure : rowFailure + rowSuccess;
      body =
        `<p>${escapeHtml(intro)}</p>` +
        `<table class="payoff"><thead><tr>` +
        `<th>Outcome</th><th>${escapeHtml(t)} voter</th><th>${escapeHtml(s)} voter</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`;
      break;
    }
  }

  if (salience === "children_infirm_present") {
    if (isHtml) {
      body += `<p class="salience">${escapeHtml(SALIENCE_LINE)}</p>`;
    } else {
      body += ` ${SALIENCE_LINE}`;
    }
  }

  return { promptText: body, promptIsHtml: isHtml };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Pick a uniformly random element from an array. */
export function pick<T>(arr: readonly T[]): T {
  const i = Math.floor(Math.random() * arr.length);
  return arr[i]!;
}

/** Randomly assign a participant to a full condition and render the prompt. */
export function randomizeCondition(): AssignedCondition {
  const mechanismFrame = pick(MECHANISM_FRAMES);
  const salienceCondition = pick(SALIENCE_CONDITIONS);
  const labelCondition = pick(LABEL_CONDITIONS);
  const orderCondition = pick(ORDER_CONDITIONS);
  const { displayedThresholdLabel, displayedSafeLabel } = labelsFor(labelCondition);
  const { promptText, promptIsHtml } = buildPrompt(
    mechanismFrame,
    salienceCondition,
    orderCondition,
    displayedThresholdLabel,
    displayedSafeLabel,
  );
  return {
    mechanismFrame,
    salienceCondition,
    labelCondition,
    orderCondition,
    displayedThresholdLabel,
    displayedSafeLabel,
    promptText,
    promptIsHtml,
  };
}
