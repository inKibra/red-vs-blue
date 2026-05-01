import type {
  AnswerRequest,
  AssignResponse,
  PublicResultsResponse,
  ResultsResponse,
  StatusResponse,
  SubmitRequest,
  SubmitResponse,
  PreviewLinkRequest,
  SubscribeRequest,
  SubscribeResponse,
  VerifyEmailRequest,
} from "@shared/types";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getStatus(): Promise<StatusResponse> {
  return asJson<StatusResponse>(await fetch("/api/poll/status"));
}

export type ReferrerData = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

export async function assign(refData?: ReferrerData): Promise<AssignResponse> {
  return asJson<AssignResponse>(
    await fetch("/api/poll/assign", {
      method: "POST",
      headers: refData ? { "Content-Type": "application/json" } : {},
      body: refData ? JSON.stringify(refData) : undefined,
    }),
  );
}

/** Per-stage save. Send only the field(s) the user just locked in. */
export async function answer(
  body: AnswerRequest,
): Promise<{ ok: true }> {
  return asJson(await postJson("/api/poll/answer", body));
}

export async function submit(body: SubmitRequest): Promise<SubmitResponse> {
  return asJson<SubmitResponse>(await postJson("/api/poll/submit", body));
}

export async function verifyEmail(
  body: VerifyEmailRequest,
): Promise<{ ok: true; alreadyVerified?: true }> {
  return asJson(await postJson("/api/poll/verify-email", body));
}

export async function adminLogin(password: string): Promise<{ ok: true }> {
  return asJson(await postJson("/api/admin/login", { password }));
}

export async function adminLogout(): Promise<{ ok: true }> {
  return asJson(await fetch("/api/admin/logout", { method: "POST" }));
}

export async function adminSession(): Promise<{ authenticated: boolean }> {
  return asJson(await fetch("/api/admin/session"));
}

export async function adminResults(): Promise<ResultsResponse> {
  return asJson<ResultsResponse>(await fetch("/api/admin/results"));
}

export async function adminEndPoll(): Promise<{ ok: true; status: "closed" }> {
  return asJson(await fetch("/api/admin/end-poll", { method: "POST" }));
}

export async function adminReopenPoll(): Promise<{ ok: true; status: "open" }> {
  return asJson(await fetch("/api/admin/reopen-poll", { method: "POST" }));
}

export async function adminSetClose(
  closesAt: string | null,
): Promise<{ ok: true; closesAt: string | null }> {
  return asJson(await postJson("/api/admin/set-close", { closesAt }));
}


export async function getPublicResults(): Promise<PublicResultsResponse> {
  return asJson<PublicResultsResponse>(await fetch("/api/poll/results"));
}

export async function adminPublishResults(): Promise<{
  ok: true;
  publishedAt: string;
  notifiedSubscribers: number;
  failedSubscribers: number;
}> {
  return asJson(await fetch("/api/admin/publish-results", { method: "POST" }));
}



export async function subscribe(body: SubscribeRequest): Promise<SubscribeResponse> {
  return asJson<SubscribeResponse>(await postJson("/api/poll/subscribe", body));
}

export async function sendPreviewLink(
  body: PreviewLinkRequest,
): Promise<{ ok: true }> {
  return asJson(await postJson("/api/poll/preview-link", body));
}