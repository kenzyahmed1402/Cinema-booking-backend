import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { useTestDatabase } from "./helpers.js";
import Payment from "../models/Payment.js";
import { PayPalError, centsToValue, createPayPalClient, valueToCents } from "../services/paypalService.js";

useTestDatabase();

const SECRET = "test-client-secret";

// A fake PayPal: answers each request from `routes` and records it
const fakePayPal = (routes) => {
  const calls = [];
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, headers: init.headers, body: init.body });
    const route = routes[path] ?? (() => ({ status: 404, body: { name: "RESOURCE_NOT_FOUND" } }));
    const { status = 200, body } = await route(init);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch, calls };
};

const tokenRoute = () => ({ body: { access_token: "token-1", expires_in: 3600 } });

const client = (fetch, extra = {}) =>
  createPayPalClient({ clientId: "test-client-id", clientSecret: SECRET, baseUrl: "https://paypal.test", fetch, ...extra });

describe("PayPal client", () => {
  it("gets one access token with the app credentials and reuses it until it expires", async () => {
    const paypal = fakePayPal({ "/v1/oauth2/token": tokenRoute });
    let time = 0;
    const pp = client(paypal.fetch, { now: () => time });

    const tokens = await Promise.all([pp.accessToken(), pp.accessToken(), pp.accessToken()]);
    assert.deepEqual(tokens, ["token-1", "token-1", "token-1"]);
    assert.equal(paypal.calls.length, 1);
    const { headers, body } = paypal.calls[0];
    assert.equal(headers.Authorization, `Basic ${Buffer.from(`test-client-id:${SECRET}`).toString("base64")}`);
    assert.equal(body, "grant_type=client_credentials");

    time = 3600 * 1000; // past the expiry, minus the safety margin
    await pp.accessToken();
    assert.equal(paypal.calls.length, 2);
  });

  it("creates an order for the server's amount, tied to the booking, idempotently", async () => {
    const paypal = fakePayPal({
      "/v1/oauth2/token": tokenRoute,
      "/v2/checkout/orders": () => ({ status: 201, body: { id: "5O190127TN364715T", status: "CREATED" } }),
    });

    const order = await client(paypal.fetch).createOrder({ amountCents: 2500, bookingId: "booking-1", requestId: "req-1" });
    assert.deepEqual(order, { orderId: "5O190127TN364715T", status: "CREATED" });

    const call = paypal.calls[1];
    assert.equal(call.headers.Authorization, "Bearer token-1");
    assert.equal(call.headers["PayPal-Request-Id"], "req-1");
    assert.deepEqual(JSON.parse(call.body), {
      intent: "CAPTURE",
      purchase_units: [
        { reference_id: "booking-1", custom_id: "booking-1", amount: { currency_code: "USD", value: "25.00" } },
      ],
    });
  });

  it("reports what a capture returned, and refuses a malformed order ID without calling PayPal", async () => {
    const paypal = fakePayPal({
      "/v1/oauth2/token": tokenRoute,
      "/v2/checkout/orders/5O190127TN364715T/capture": () => ({
        status: 201,
        body: {
          id: "5O190127TN364715T",
          status: "COMPLETED",
          purchase_units: [
            {
              custom_id: "booking-1",
              payee: { merchant_id: "MERCHANT1" },
              payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED", amount: { currency_code: "USD", value: "25.00" } }] },
            },
          ],
        },
      }),
    });
    const pp = client(paypal.fetch);

    assert.deepEqual(await pp.captureOrder("5O190127TN364715T"), {
      orderId: "5O190127TN364715T",
      orderStatus: "COMPLETED",
      bookingId: "booking-1",
      captureId: "3C679366HH908993F",
      captureStatus: "COMPLETED",
      amountCents: 2500,
      currency: "USD",
      payeeMerchantId: "MERCHANT1",
    });

    const calls = paypal.calls.length;
    await assert.rejects(pp.captureOrder("../../v1/payments"), { statusCode: 400 });
    assert.equal(paypal.calls.length, calls);
  });

  it("refunds part of a capture or all of it", async () => {
    const paypal = fakePayPal({
      "/v1/oauth2/token": tokenRoute,
      "/v2/payments/captures/3C679366HH908993F/refund": () => ({
        status: 201,
        body: { id: "1JU08902781691411", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } },
      }),
    });
    const pp = client(paypal.fetch);

    const partial = await pp.refundCapture("3C679366HH908993F", { amountCents: 1000, requestId: "refund-1" });
    assert.deepEqual(partial, { refundId: "1JU08902781691411", status: "COMPLETED", amountCents: 1000 });
    assert.deepEqual(JSON.parse(paypal.calls[1].body), { amount: { currency_code: "USD", value: "10.00" } });
    assert.equal(paypal.calls[1].headers["PayPal-Request-Id"], "refund-1");

    await pp.refundCapture("3C679366HH908993F");
    assert.deepEqual(JSON.parse(paypal.calls[2].body), {});
    await assert.rejects(pp.refundCapture("x/../y"), { statusCode: 400 });
  });

  it("turns PayPal and network failures into errors that contain no secrets", async () => {
    const declined = fakePayPal({
      "/v1/oauth2/token": tokenRoute,
      "/v2/checkout/orders": () => ({ status: 422, body: { name: "UNPROCESSABLE_ENTITY", debug_id: "abc123" } }),
    });
    const err = await client(declined.fetch).createOrder({ amountCents: 100, bookingId: "b" }).catch((e) => e);
    assert.ok(err instanceof PayPalError);
    assert.equal(err.paypalStatus, 422);
    assert.equal(err.paypalName, "UNPROCESSABLE_ENTITY");
    assert.equal(err.debugId, "abc123");
    for (const text of [err.message, JSON.stringify(err)]) {
      assert.doesNotMatch(text, new RegExp(`${SECRET}|token-1`));
    }

    const offline = client(async () => {
      throw new TypeError("fetch failed");
    });
    await assert.rejects(offline.accessToken(), { name: "PayPalError", message: /Could not reach PayPal/ });
  });

  it("refuses to start without credentials", () => {
    assert.throws(() => createPayPalClient({ clientId: "id" }), { statusCode: 503 });
  });

  it("converts between cents and PayPal amounts exactly", () => {
    assert.equal(centsToValue(2500), "25.00");
    assert.equal(centsToValue(1205), "12.05");
    assert.equal(valueToCents("12.5"), 1250);
    assert.equal(valueToCents("0.07"), 7);
    for (const bad of ["25.001", "-1", "1e3", "abc", ""]) {
      assert.throws(() => valueToCents(bad), undefined, bad);
    }
  });
});

describe("Payment model", () => {
  it("never records the same PayPal order or capture twice", async () => {
    await Payment.syncIndexes();
    const base = { booking: "65a000000000000000000001", user: "65a000000000000000000002", amountCents: 2500, currency: "usd" };

    const first = await Payment.create({ ...base, paypalOrderId: "ORDER1", captureId: "CAPTURE1" });
    assert.equal(first.currency, "USD");
    assert.equal(first.status, "created");
    // Payments without a capture yet don't clash with each other
    await Payment.create({ ...base, paypalOrderId: "ORDER2" });
    await Payment.create({ ...base, paypalOrderId: "ORDER3" });

    await assert.rejects(Payment.create({ ...base, paypalOrderId: "ORDER1" }), { code: 11000 });
    await assert.rejects(Payment.create({ ...base, paypalOrderId: "ORDER4", captureId: "CAPTURE1" }), { code: 11000 });
    await assert.rejects(Payment.create({ ...base, paypalOrderId: "ORDER5", amountCents: 12.5 }), { name: "ValidationError" });
  });
});
