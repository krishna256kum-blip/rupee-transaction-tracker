import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { createApp } from "../../../server/app.js";
import { createDatabase, saveTransaction } from "../../../server/db.js";

test("parse API stores encrypted data and returns a masked account suffix", async (context) => {
  const db = createDatabase();
  const key = randomBytes(32);
  const sessionKey = randomBytes(32);
  const appPassword = "correct-horse-battery";
  const server = createApp({ db, key, sessionKey, appPassword }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => {
    server.close();
    db.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ password: appPassword }),
  });
  assert.equal(loginResponse.status, 200);
  const sessionCookie = loginResponse.headers.get("set-cookie").split(";")[0];

  const response = await fetch(`${baseUrl}/api/parse-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ rawSms: "A/c XX1234 debited INR 500 via UPI to Chai Point" }),
  });
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.transaction.amount, 500);
  assert.equal(result.transaction.merchant, "Chai Point");
  assert.equal(result.transaction.last_4_digits, "•••• 1234");

  const row = db.prepare("SELECT * FROM transactions").get();
  assert.equal(row.amount_encrypted.includes("500"), false);
  assert.equal(row.merchant_encrypted.includes("Chai Point"), false);
  assert.equal(row.last_4_digits_encrypted.includes("1234"), false);

  const month = new Date().toISOString().slice(0, 7);
  for (let index = 0; index < 500; index += 1) {
    saveTransaction(
      db,
      {
        amount: 0.1,
        merchant: `Snack ${index}`,
        last_4_digits: null,
        transaction_type: "DEBIT",
        category: "Food",
        date: `${month}-15`,
      },
      key
    );
  }
  saveTransaction(
    db,
    {
      amount: 900,
      merchant: "Salary",
      last_4_digits: null,
      transaction_type: "CREDIT",
      category: "Other",
      date: `${month}-10`,
    },
    key
  );

  const summaryResponse = await fetch(`${baseUrl}/api/dashboard-summary`, {
    headers: { Cookie: sessionCookie },
  });
  const summary = await summaryResponse.json();
  assert.equal(summary.monthlyTotal, 550);
  assert.equal(summary.topCategory, "Food");
  assert.equal(summary.transactionCount, 502);
  assert.equal(summary.recentTransactions[0].last_4_digits, "•••• 1234");

  const filteredResponse = await fetch(
    `${baseUrl}/api/transactions?category=Food&q=Chai&limit=25`,
    {
      headers: { Cookie: sessionCookie },
    }
  );
  const filtered = await filteredResponse.json();
  assert.equal(filtered.transactions.length, 1);
  assert.equal(filtered.transactions[0].merchant, "Chai Point");
});

test("parse API validates missing and unrecognized messages", async (context) => {
  const db = createDatabase();
  const sessionKey = randomBytes(32);
  const appPassword = "correct-horse-battery";
  const server = createApp({ db, key: randomBytes(32), sessionKey, appPassword }).listen(
    0,
    "127.0.0.1"
  );
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => {
    server.close();
    db.close();
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ password: appPassword }),
  });
  const sessionCookie = loginResponse.headers.get("set-cookie").split(";")[0];

  const missingResponse = await fetch(`${baseUrl}/api/parse-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({}),
  });
  assert.equal(missingResponse.status, 400);

  const invalidResponse = await fetch(`${baseUrl}/api/parse-sms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({ rawSms: "Your balance is INR 300" }),
  });
  assert.equal(invalidResponse.status, 422);
});

test("API data is protected, login enforces origins and rate-limits failures", async (context) => {
  const db = createDatabase();
  const server = createApp({
    db,
    key: randomBytes(32),
    sessionKey: randomBytes(32),
    appPassword: "correct-horse-battery",
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  context.after(() => {
    server.close();
    db.close();
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const unauthenticatedResponse = await fetch(`${baseUrl}/api/dashboard-summary`);
  assert.equal(unauthenticatedResponse.status, 401);

  const crossOriginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://untrusted.example",
    },
    body: JSON.stringify({ password: "correct-horse-battery" }),
  });
  assert.equal(crossOriginResponse.status, 403);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    assert.equal(response.status, 401);
  }
  const rateLimitedResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify({ password: "correct-horse-battery" }),
  });
  assert.equal(rateLimitedResponse.status, 429);
  assert.ok(rateLimitedResponse.headers.has("retry-after"));
});
