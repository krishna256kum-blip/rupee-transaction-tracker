import express from "express";
import {
  clearSessionCookie,
  createSessionToken,
  getSessionToken,
  isValidSessionToken,
  sessionCookie,
  verifyPassword,
} from "./auth.js";
import { categorizeMerchant } from "./categorize.js";
import { listTransactions, saveTransaction } from "./db.js";
import { parseSms } from "./parser.js";

function maskAccountDigits(digits) {
  return digits ? `•••• ${digits}` : null;
}

function monthlySummary(monthTransactions, recentTransactions, month) {
  const debits = monthTransactions.filter(
    (transaction) => transaction.transaction_type === "DEBIT"
  );
  const monthlyTotalCents = debits.reduce(
    (total, transaction) => total + Math.round(transaction.amount * 100),
    0
  );
  const categoryTotals = new Map();
  const dailyTotals = new Map();

  for (const transaction of debits) {
    categoryTotals.set(
      transaction.category,
      (categoryTotals.get(transaction.category) ?? 0) + Math.round(transaction.amount * 100)
    );
    dailyTotals.set(
      transaction.date,
      (dailyTotals.get(transaction.date) ?? 0) + Math.round(transaction.amount * 100)
    );
  }

  const categoryBreakdown = [...categoryTotals]
    .map(([category, totalCents]) => ({ category, total: totalCents / 100 }))
    .sort((left, right) => right.total - left.total);
  const recent = recentTransactions.map((transaction) => ({
    ...transaction,
    last_4_digits: maskAccountDigits(transaction.last_4_digits),
  }));

  return {
    month,
    monthlyTotal: monthlyTotalCents / 100,
    transactionCount: monthTransactions.length,
    topCategory: categoryBreakdown[0]?.category ?? null,
    categoryBreakdown,
    dailySpending: [...dailyTotals]
      .map(([date, totalCents]) => ({ date, total: totalCents / 100 }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    recentTransactions: recent,
  };
}

export function createApp({
  db,
  key,
  appPassword,
  sessionKey,
  allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"],
  production = false,
}) {
  if (typeof appPassword !== "string" || appPassword.length < 12) {
    throw new Error("TRANSACTION_APP_PASSWORD must be at least 12 characters");
  }
  if (!Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
    throw new Error("TRANSACTION_SESSION_SECRET must encode exactly 32 bytes");
  }

  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  const loginAttempts = new Map();
  const windowMs = 15 * 60 * 1000;
  const maximumAttempts = 5;

  app.use((request, response, next) => {
    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "OPTIONS") {
      const origin = request.get("origin");
      if (!origin || !allowedOrigins.includes(origin)) {
        return response.status(403).json({ error: "Cross-origin request denied" });
      }
    }

    next();
  });

  app.get("/api/auth/session", (request, response) => {
    const token = getSessionToken(request);
    return response.json({
      authenticated: isValidSessionToken(token, sessionKey),
    });
  });

  app.post("/api/auth/login", (request, response) => {
    const address = request.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(address);
    if (attempts && attempts.resetAt > now && attempts.count >= maximumAttempts) {
      response.setHeader("Retry-After", String(Math.ceil((attempts.resetAt - now) / 1000)));
      return response.status(429).json({ error: "Too many login attempts; try again later" });
    }

    const { password } = request.body ?? {};
    if (!verifyPassword(password, appPassword)) {
      const nextAttempts =
        attempts && attempts.resetAt > now ? attempts : { count: 0, resetAt: now + windowMs };
      nextAttempts.count += 1;
      loginAttempts.set(address, nextAttempts);
      return response.status(401).json({ error: "Incorrect password" });
    }

    loginAttempts.delete(address);
    const { token } = createSessionToken(sessionKey);
    response.setHeader("Set-Cookie", sessionCookie(token, { secure: production }));
    response.setHeader("Cache-Control", "no-store");
    return response.json({ authenticated: true });
  });

  app.post("/api/auth/logout", (_request, response) => {
    response.setHeader("Set-Cookie", clearSessionCookie({ secure: production }));
    response.setHeader("Cache-Control", "no-store");
    return response.json({ authenticated: false });
  });

  app.use((request, response, next) => {
    const token = getSessionToken(request);
    if (!isValidSessionToken(token, sessionKey)) {
      response.setHeader("WWW-Authenticate", "Session");
      return response.status(401).json({ error: "Authentication required" });
    }
    request.sessionAuthenticated = true;
    return next();
  });

  app.post("/api/parse-sms", (request, response, next) => {
    try {
      const { rawSms } = request.body ?? {};
      if (typeof rawSms !== "string" || rawSms.trim().length === 0) {
        return response.status(400).json({ error: "rawSms must be a non-empty string" });
      }

      const parsed = parseSms(rawSms);
      const transaction = saveTransaction(
        db,
        {
          ...parsed,
          category: categorizeMerchant(parsed.merchant),
        },
        key
      );

      return response.status(201).json({
        transaction: {
          ...transaction,
          last_4_digits: maskAccountDigits(transaction.last_4_digits),
        },
      });
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        return response.status(400).json({ error: error.message });
      }
      if (error instanceof SyntaxError) {
        return response.status(400).json({ error: "Invalid SMS text" });
      }
      if (
        error.message.startsWith("Could not ") ||
        error.message.startsWith("Transaction amount")
      ) {
        return response.status(422).json({ error: error.message });
      }
      return next(error);
    }
  });

  app.get("/api/dashboard-summary", (_request, response) => {
    const month = new Date().toISOString().slice(0, 7);
    const monthTransactions = listTransactions(db, key, { month });
    const recentTransactions = listTransactions(db, key, { limit: 10 });
    return response.json(monthlySummary(monthTransactions, recentTransactions, month));
  });

  app.get("/api/transactions", (request, response) => {
    const limitValue = Number(request.query.limit ?? 500);
    if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 500) {
      return response.status(400).json({ error: "limit must be an integer from 1 to 500" });
    }

    const category =
      typeof request.query.category === "string" ? request.query.category : undefined;
    const search = typeof request.query.q === "string" ? request.query.q : undefined;
    const transactions = listTransactions(db, key, { category, search, limit: limitValue }).map(
      (transaction) => ({
        ...transaction,
        last_4_digits: maskAccountDigits(transaction.last_4_digits),
      })
    );

    return response.json({ transactions });
  });

  app.use((error, _request, response, _next) => {
    console.error("Transaction tracker API request failed", error);
    const status = Number.isInteger(error.status) && error.status >= 400 ? error.status : 500;
    return response.status(status).json({
      error: status < 500 ? "Invalid request" : "Internal server error",
    });
  });

  return app;
}
