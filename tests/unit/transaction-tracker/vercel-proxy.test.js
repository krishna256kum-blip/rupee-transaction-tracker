import assert from "node:assert/strict";
import test from "node:test";
import handler from "../../../api/[...path].js";

function createResponse() {
  return {
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

test("Vercel API proxy rejects unconfigured targets and unsupported methods", async () => {
  const priorOrigin = process.env.TRANSACTION_API_ORIGIN;
  delete process.env.TRANSACTION_API_ORIGIN;
  try {
    const unconfigured = createResponse();
    await handler({ method: "GET", url: "/api/auth/session", headers: {} }, unconfigured);
    assert.equal(unconfigured.statusCode, 503);

    process.env.TRANSACTION_API_ORIGIN = "https://api.example.com";
    const unsupported = createResponse();
    await handler({ method: "DELETE", url: "/api/auth/session", headers: {} }, unsupported);
    assert.equal(unsupported.statusCode, 405);
  } finally {
    if (priorOrigin === undefined) delete process.env.TRANSACTION_API_ORIGIN;
    else process.env.TRANSACTION_API_ORIGIN = priorOrigin;
  }
});

test("Vercel API proxy forwards same-origin auth cookies and API responses", async () => {
  const priorOrigin = process.env.TRANSACTION_API_ORIGIN;
  const originalFetch = globalThis.fetch;
  process.env.TRANSACTION_API_ORIGIN = "https://api.example.com";
  let forwardedUrl;
  let forwardedHeaders;
  globalThis.fetch = async (url, options) => {
    forwardedUrl = url;
    forwardedHeaders = options.headers;
    return new Response(JSON.stringify({ authenticated: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "transaction-tracker-session=token; HttpOnly",
      },
    });
  };

  try {
    const response = createResponse();
    await handler(
      {
        method: "POST",
        url: "/api/auth/login",
        headers: {
          origin: "https://tracker.vercel.app",
          cookie: "transaction-tracker-session=existing",
          "content-type": "application/json",
        },
        body: { password: "secret" },
      },
      response
    );

    assert.equal(forwardedUrl.href, "https://api.example.com/api/auth/login");
    assert.equal(forwardedHeaders.get("origin"), "https://tracker.vercel.app");
    assert.equal(forwardedHeaders.get("cookie"), "transaction-tracker-session=existing");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.deepEqual(response.headers["set-cookie"], [
      "transaction-tracker-session=token; HttpOnly",
    ]);
    assert.equal(response.body.toString(), JSON.stringify({ authenticated: true }));
  } finally {
    globalThis.fetch = originalFetch;
    if (priorOrigin === undefined) delete process.env.TRANSACTION_API_ORIGIN;
    else process.env.TRANSACTION_API_ORIGIN = priorOrigin;
  }
});
