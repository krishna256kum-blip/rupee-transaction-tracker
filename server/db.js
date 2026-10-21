import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { decrypt, encrypt } from "./encryption.js";

export function createDatabase(filename = ":memory:") {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      amount_encrypted TEXT NOT NULL,
      merchant_encrypted TEXT NOT NULL,
      last_4_digits_encrypted TEXT,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT')),
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS transactions_category_date_idx ON transactions(category, date DESC);
  `);

  return db;
}

export function saveTransaction(db, transaction, key) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO transactions (
      id, amount_encrypted, merchant_encrypted, last_4_digits_encrypted,
      transaction_type, category, date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    encrypt(String(transaction.amount), key),
    encrypt(transaction.merchant ?? "", key),
    transaction.last_4_digits ? encrypt(transaction.last_4_digits, key) : null,
    transaction.transaction_type,
    transaction.category,
    transaction.date,
    createdAt
  );

  return readTransaction(db.prepare("SELECT * FROM transactions WHERE id = ?").get(id), key);
}

export function readTransaction(row, key) {
  return {
    id: row.id,
    amount: Number(decrypt(row.amount_encrypted, key)),
    merchant: decrypt(row.merchant_encrypted, key) || null,
    last_4_digits: row.last_4_digits_encrypted ? decrypt(row.last_4_digits_encrypted, key) : null,
    transaction_type: row.transaction_type,
    category: row.category,
    date: row.date,
    created_at: row.created_at,
  };
}

export function listTransactions(db, key, { category, search, limit = 500, month } = {}) {
  let rows;
  if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    rows = db
      .prepare(
        `
      SELECT * FROM transactions
      WHERE date >= ? AND date < ?
      ORDER BY date DESC, created_at DESC
    `
      )
      .all(`${month}-01`, nextMonth);
  } else if (category) {
    rows = db
      .prepare(
        `
      SELECT * FROM transactions
      WHERE category = ?
      ORDER BY date DESC, created_at DESC
      LIMIT ?
    `
      )
      .all(category, limit);
  } else {
    rows = db
      .prepare(
        `
      SELECT * FROM transactions
      ORDER BY date DESC, created_at DESC
      LIMIT ?
    `
      )
      .all(limit);
  }

  const normalizedSearch = search?.trim().toLowerCase();

  return rows
    .map((row) => readTransaction(row, key))
    .filter(
      (transaction) =>
        !normalizedSearch ||
        transaction.merchant?.toLowerCase().includes(normalizedSearch) ||
        transaction.category.toLowerCase().includes(normalizedSearch)
    );
}
