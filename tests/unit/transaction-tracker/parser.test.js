import assert from "node:assert/strict";
import test from "node:test";
import { categorizeMerchant } from "../../../server/categorize.js";
import { parseSms } from "../../../server/parser.js";

test("parses a debit SMS with an INR amount, merchant, and named date", () => {
  assert.deepEqual(parseSms("Debited by Rs 250.00 to Swiggy on 12-Oct-26"), {
    transaction_type: "DEBIT",
    amount: 250,
    merchant: "Swiggy",
    date: "2026-10-12",
    last_4_digits: null,
  });
});

test("parses a UPI transaction and masked account suffix", () => {
  assert.deepEqual(parseSms("A/c XX1234 debited INR 500 via UPI to Chai Point"), {
    transaction_type: "DEBIT",
    amount: 500,
    merchant: "Chai Point",
    date: new Date().toISOString().slice(0, 10),
    last_4_digits: "1234",
  });
});

test("parses credits, grouped amounts, and ISO dates", () => {
  assert.deepEqual(parseSms("INR 1,250 credited from salary on 2026-10-01"), {
    transaction_type: "CREDIT",
    amount: 1250,
    merchant: null,
    date: "2026-10-01",
    last_4_digits: null,
  });
});

test("parses common Indian numeric dates as day/month/year", () => {
  assert.equal(parseSms("Debited INR 75 to Cafe on 12/10/26").date, "2026-10-12");
});

test("rejects empty, oversized, and unrecognized transaction messages", () => {
  assert.throws(() => parseSms("  "), /SMS text is required/);
  assert.throws(() => parseSms("x".repeat(5001)), /5000 characters/);
  assert.throws(() => parseSms("Your account balance is INR 250"), /determine/);
  assert.throws(() => parseSms("Debited at Shop"), /transaction amount/);
});

test("categorizes known merchants and supports a custom fallback", () => {
  assert.equal(categorizeMerchant("Swiggy Instamart"), "Food");
  assert.equal(categorizeMerchant("IRCTC Rail"), "Travel");
  assert.equal(categorizeMerchant("Amazon"), "Shopping");
  assert.equal(categorizeMerchant("Electricity Bill"), "Utilities");
  assert.equal(categorizeMerchant("Corner Store"), "Other");
  assert.equal(categorizeMerchant("Corner Store", "Uncategorized"), "Uncategorized");
});
