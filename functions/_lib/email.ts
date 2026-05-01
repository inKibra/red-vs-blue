import { render } from "@react-email/render";
import { createElement } from "react";
import OtcEmail, { type OtcEmailProps } from "./templates/OtcEmail";
import PreviewLinkEmail, { type PreviewLinkEmailProps } from "./templates/PreviewLinkEmail";
import ResultsEmail, { type ResultsEmailProps } from "./templates/ResultsEmail";
import type { Env } from "./env";

/**
 * Discriminated union of supported email templates. Adding a new template
 * means: write the .tsx, add a kind here, dispatch in renderTemplate.
 */
export type EmailTemplate =
  | { kind: "otc"; props: OtcEmailProps }
  | { kind: "results"; props: ResultsEmailProps }
  | { kind: "preview-link"; props: PreviewLinkEmailProps };

export type EmailMessage = {
  to: string;
  subject: string;
  template: EmailTemplate;
};

async function renderTemplate(
  template: EmailTemplate,
): Promise<{ html: string; text: string }> {
  const element =
    template.kind === "otc"
      ? createElement(OtcEmail, template.props)
      : template.kind === "results"
        ? createElement(ResultsEmail, template.props)
        : createElement(PreviewLinkEmail, template.props);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}

/**
 * Send an email. Two modes, picked by configuration presence:
 *
 *   1. Cloudflare Email Service (production).
 *      Requires `EMAIL_FROM_ADDRESS`, `CF_ACCOUNT_ID`, and `CF_EMAIL_API_TOKEN`
 *      to be set. Calls the Email Service REST endpoint:
 *        POST https://api.cloudflare.com/client/v4/accounts/{id}/email/sending/send
 *      Pages Functions can't use the `send_email` binding (Workers-only at
 *      the moment), so we use the REST API instead. Same email infra; the
 *      sending domain still has to be onboarded under Email Sending.
 *
 *   2. Dev outbox fallback.
 *      If any of the three env vars above are missing, we render the email
 *      and write it to the `dev_emails` D1 table. The admin-gated viewer at
 *      `/dev/email/<id>` shows the rendered HTML. This is the local-dev
 *      path; in production, an unconfigured deploy lands here too, but
 *      `/dev/email/*` requires the admin cookie, so leaked OTCs aren't
 *      reachable from outside.
 *
 * Either way, callers don't branch on environment.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<string> {
  const { html, text } = await renderTemplate(msg.template);

  const canSend =
    !!env.EMAIL_FROM_ADDRESS && !!env.CF_ACCOUNT_ID && !!env.CF_EMAIL_API_TOKEN;
  if (!canSend) {
    return writeDevOutbox(env, msg, html, text);
  }

  // The REST API expects `from` as a plain string. Display name folds in
  // via RFC 5322 form: `Name <addr@domain>`.
  const fromHeader = env.EMAIL_FROM_NAME
    ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`
    : env.EMAIL_FROM_ADDRESS;
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_EMAIL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: msg.to,
      from: fromHeader,
      subject: msg.subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CF Email Service error ${res.status}: ${body.slice(0, 500)}`);
  }
  // Response shape: { success, errors, messages, result: { delivered, ... } }
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: Array<{ code: number; message: string }>;
    result?: { delivered?: string[]; permanent_bounces?: string[] };
  };
  if (!json.success) {
    const detail = (json.errors ?? []).map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`CF Email Service rejected: ${detail || "unknown error"}`);
  }
  // The REST endpoint doesn't echo a per-message id; use a synthetic.
  return `cf-email:${msg.to}:${Date.now()}`;
}

async function writeDevOutbox(
  env: Env,
  msg: EmailMessage,
  html: string,
  text: string,
): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO dev_emails (id, created_at, to_addr, subject, html, text)
     VALUES (?, datetime('now'), ?, ?, ?, ?)`,
  )
    .bind(id, msg.to, msg.subject, html, text)
    .run();
  console.log(
    `📧 [dev outbox] to=${msg.to} subject="${msg.subject}" id=${id}\n   view: /dev/email/${id}`,
  );
  return id;
}
