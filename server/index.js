import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createDatabase } from "./db.js";
import { parseEncryptionKey } from "./encryption.js";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(appDirectory, "..");
const key = parseEncryptionKey(process.env.TRANSACTION_ENCRYPTION_KEY);
const sessionKey = parseEncryptionKey(process.env.TRANSACTION_SESSION_SECRET);
const appPassword = process.env.TRANSACTION_APP_PASSWORD;
if (typeof appPassword !== "string" || appPassword.length < 12) {
  throw new Error("TRANSACTION_APP_PASSWORD must be set and contain at least 12 characters");
}
const allowedOrigins = (process.env.APP_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const production = process.env.NODE_ENV === "production";
if (production && (!process.env.APP_ORIGINS || allowedOrigins.length === 0)) {
  throw new Error("APP_ORIGINS must list the exact HTTPS frontend origin in production");
}
for (const origin of allowedOrigins) {
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.origin !== origin || (production && parsedOrigin.protocol !== "https:")) {
    throw new Error("APP_ORIGINS must contain exact origins; production origins must use HTTPS");
  }
}
const databasePath = resolve(appRoot, process.env.DATABASE_PATH ?? "./data/transactions.sqlite");
const port = Number(process.env.PORT ?? 3001);
const host = "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}

const { mkdir } = await import("node:fs/promises");
await mkdir(dirname(databasePath), { recursive: true });

const db = createDatabase(databasePath);
const server = createApp({
  db,
  key,
  appPassword,
  sessionKey,
  allowedOrigins,
  production,
}).listen(port, host, () => {
  console.log(`Transaction tracker API listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
