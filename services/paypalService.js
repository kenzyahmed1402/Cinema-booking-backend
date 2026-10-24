import AppError from "../utils/AppError.js";

// Only the PayPal Sandbox is ever used. The address is fixed in code, not a
// setting, so the app can't be pointed at live PayPal by configuration.
export const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";
export const PAYPAL_CURRENCY = "USD";

const REQUEST_TIMEOUT_MS = 15000;
// Renew the access token a minute before PayPal says it expires
const TOKEN_MARGIN_MS = 60 * 1000;
// PayPal order and capture IDs are short upper-case letters and digits
export const ORDER_ID_PATTERN = /^[A-Z0-9]{5,36}$/;

// An error from PayPal or from reaching it. The message never contains
// credentials, tokens or request bodies. paypalStatus is PayPal's HTTP
// status, kept apart from the status this API answers with.
export class PayPalError extends Error {
  constructor(message, { status, name, debugId } = {}) {
    super(message);
    this.name = "PayPalError";
    this.paypalStatus = status;
    this.paypalName = name;
    this.debugId = debugId;
  }
}

// Turns a PayPal failure into a clear answer without PayPal's internals,
// which are only logged. A 422 is PayPal refusing (e.g. a declined card);
// anything else means PayPal couldn't be reached properly.
export const paypalFailure = (err, refusedMessage) => {
  if (!(err instanceof PayPalError)) {
    return err;
  }
  console.error(`PayPal request failed: ${err.paypalStatus ?? "no response"} ${err.paypalName ?? ""} debug_id=${err.debugId ?? "-"}`);
  if (err.paypalStatus === 422) {
    return new AppError(refusedMessage, 422);
  }
  return new AppError("PayPal is not available right now. Please try again.", 502);
};

// 2500 -> "25.00", the format PayPal expects for amounts
export const centsToValue = (cents) => {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error(`Invalid amount in cents: ${cents}`);
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
};

// "25.00" -> 2500. Refuses anything that isn't a plain amount with at most
// two decimals, so a malformed PayPal response can't turn into a wrong total.
export const valueToCents = (value) => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
};

// Creates a PayPal client for the given credentials. `fetch` and `now` can
// be replaced in tests; `baseUrl` only exists so tests never reach PayPal.
export const createPayPalClient = ({
  clientId,
  clientSecret,
  baseUrl = PAYPAL_SANDBOX_API,
  fetch = globalThis.fetch,
  now = Date.now,
}) => {
  if (!clientId || !clientSecret) {
    throw new AppError("Payments are not configured on this server", 503);
  }

  let token;
  let tokenExpiresAt = 0;
  let tokenRequest;

  const send = async (path, init) => {
    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new PayPalError(`Could not reach PayPal: ${err.name === "TimeoutError" ? "timed out" : "network error"}`);
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      // PayPal's error name and debug ID help support; nothing else is copied
      throw new PayPalError(`PayPal request failed with status ${res.status}`, {
        status: res.status,
        name: body.name ?? body.error,
        debugId: body.debug_id,
      });
    }
    return body;
  };

  const requestToken = async () => {
    const body = await send("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!body.access_token) {
      throw new PayPalError("PayPal returned no access token");
    }
    token = body.access_token;
    tokenExpiresAt = now() + Number(body.expires_in ?? 0) * 1000 - TOKEN_MARGIN_MS;
    return token;
  };

  // One token is reused until shortly before it expires; requests made while
  // a new one is being fetched wait for that same request
  const accessToken = async () => {
    if (token && now() < tokenExpiresAt) {
      return token;
    }
    tokenRequest ??= requestToken().finally(() => {
      tokenRequest = undefined;
    });
    return tokenRequest;
  };

  // `requestId` makes the call idempotent at PayPal: repeating it with the
  // same ID returns the first result instead of acting twice. `rawJson` sends
  // an already serialized body as is.
  // `fullResponse` asks PayPal for every detail instead of its short answer
  const authorized = async (path, { body, rawJson, requestId, fullResponse }) =>
    send(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
        ...(requestId && { "PayPal-Request-Id": requestId }),
        ...(fullResponse && { Prefer: "return=representation" }),
      },
      body: rawJson ?? JSON.stringify(body ?? {}),
    });

  const authorizedGet = async (path) =>
    send(path, { method: "GET", headers: { Authorization: `Bearer ${await accessToken()}` } });

  // Creates an order for the amount the server calculated. `bookingId` is
  // stored on the order so a capture or webhook can be matched to it.
  const createOrder = async ({ amountCents, currency = PAYPAL_CURRENCY, bookingId, requestId }) => {
    const order = await authorized("/v2/checkout/orders", {
      requestId,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: String(bookingId),
            custom_id: String(bookingId),
            amount: { currency_code: currency, value: centsToValue(amountCents) },
          },
        ],
      },
    });
    return { orderId: order.id, status: order.status };
  };

  // Captures an approved order and returns what PayPal reports, for the
  // caller to check against the booking. Nothing here decides the booking is
  // paid.
  const captureOrder = async (orderId, { requestId } = {}) => {
    if (!ORDER_ID_PATTERN.test(String(orderId))) {
      throw new AppError("Invalid PayPal order ID", 400);
    }
    const order = await authorized(`/v2/checkout/orders/${orderId}/capture`, { requestId, fullResponse: true });
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];

    // PayPal puts the booking reference on the capture itself; the payee may
    // only be on the order. Anything the capture answer leaves out is read
    // from the order, so the checks always compare real values.
    let bookingId = capture?.custom_id ?? unit?.custom_id;
    let payeeMerchantId = unit?.payee?.merchant_id;
    if (!bookingId || !payeeMerchantId) {
      const details = (await authorizedGet(`/v2/checkout/orders/${orderId}`)).purchase_units?.[0];
      bookingId ??= details?.custom_id ?? details?.reference_id;
      payeeMerchantId ??= details?.payee?.merchant_id;
    }

    return {
      orderId: order.id,
      orderStatus: order.status,
      bookingId,
      captureId: capture?.id,
      captureStatus: capture?.status,
      amountCents: capture?.amount ? valueToCents(capture.amount.value) : undefined,
      currency: capture?.amount?.currency_code,
      payeeMerchantId,
    };
  };

  // Refunds a capture: `amountCents` for a partial refund, or the whole
  // capture when it's left out. Returns PayPal's refund ID and status.
  const refundCapture = async (captureId, { amountCents, currency = PAYPAL_CURRENCY, requestId } = {}) => {
    if (!ORDER_ID_PATTERN.test(String(captureId))) {
      throw new AppError("Invalid PayPal capture ID", 400);
    }
    const refund = await authorized(`/v2/payments/captures/${captureId}/refund`, {
      requestId,
      body: amountCents === undefined ? {} : { amount: { currency_code: currency, value: centsToValue(amountCents) } },
    });
    return {
      refundId: refund.id,
      status: refund.status,
      amountCents: refund.amount ? valueToCents(refund.amount.value) : amountCents,
    };
  };

  // Asks PayPal whether a webhook message really came from PayPal for this
  // app's webhook. `rawBody` is the event exactly as received: re-encoding
  // it could change the bytes the signature was made for. Resolves to true
  // only for PayPal's "SUCCESS".
  const verifyWebhookSignature = async ({ headers, rawBody, webhookId }) => {
    const field = (name) => JSON.stringify(String(headers[name]));
    const rawJson =
      `{"auth_algo":${field("paypal-auth-algo")},"cert_url":${field("paypal-cert-url")},` +
      `"transmission_id":${field("paypal-transmission-id")},"transmission_sig":${field("paypal-transmission-sig")},` +
      `"transmission_time":${field("paypal-transmission-time")},"webhook_id":${JSON.stringify(String(webhookId))},` +
      `"webhook_event":${rawBody}}`;
    const result = await authorized("/v1/notifications/verify-webhook-signature", { rawJson });
    return result.verification_status === "SUCCESS";
  };

  return { accessToken, createOrder, captureOrder, refundCapture, verifyWebhookSignature };
};

let defaultClient;

// The client for this server's Sandbox credentials, created on first use.
// Throws 503 if PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET aren't set.
export const getPayPalClient = () => {
  defaultClient ??= createPayPalClient({
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
  });
  return defaultClient;
};

// Replaces the client, so tests can use a fake PayPal. Not reachable from
// any request.
export const setPayPalClient = (client) => {
  defaultClient = client;
};
