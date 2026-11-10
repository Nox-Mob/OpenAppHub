// Minimal Stripe REST client for the Worker (no SDK). Server only.
import { formEncode } from "./core";

const API = "https://api.stripe.com/v1";

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function stripePost<T>(
  secret: string,
  path: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: formEncode(params),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    // The message is Stripe's (no secrets); log only the status and code.
    throw new StripeError(
      body.error?.message ?? "Stripe request failed",
      res.status,
      body.error?.code,
    );
  }
  return body as T;
}

export async function stripeGet<T>(
  secret: string,
  path: string,
  params: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const query = formEncode(params);
  const res = await fetchImpl(`${API}${path}${query ? `?${query}` : ""}`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    throw new StripeError(
      body.error?.message ?? "Stripe request failed",
      res.status,
      body.error?.code,
    );
  }
  return body as T;
}
