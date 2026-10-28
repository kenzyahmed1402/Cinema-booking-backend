import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api } from "./helpers.js";

const original = process.env.PAYPAL_CLIENT_ID;

afterEach(() => {
  if (original === undefined) delete process.env.PAYPAL_CLIENT_ID;
  else process.env.PAYPAL_CLIENT_ID = original;
});

describe("the web app's PayPal settings", () => {
  it("gives the public client ID without a login, never the secret", async () => {
    process.env.PAYPAL_CLIENT_ID = "public-client-id";
    const res = await api.get("/payments/config");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { clientId: "public-client-id", currency: "USD" });
    assert.doesNotMatch(JSON.stringify(res.body), /secret/i);
  });

  it("says payments aren't set up when there is no client ID", async () => {
    delete process.env.PAYPAL_CLIENT_ID;
    const res = await api.get("/payments/config");
    assert.equal(res.status, 503);
  });

  it("lets pages load PayPal's button and its popup, and nothing else from outside", async () => {
    const res = await api.get("/health");
    const policy = res.headers["content-security-policy"];
    for (const directive of ["script-src", "frame-src", "connect-src", "img-src"]) {
      const sources = policy.split(";").find((part) => part.startsWith(`${directive} `));
      assert.ok(sources, `${directive} is set`);
      assert.match(sources, /https:\/\/\*\.paypal\.com/);
    }
    assert.match(policy, /script-src 'self' https:\/\/\*\.paypal\.com https:\/\/\*\.paypalobjects\.com;/);
    assert.match(policy, /object-src 'none'/);
    assert.equal(res.headers["cross-origin-opener-policy"], "same-origin-allow-popups");
  });
});
