const MAX_SMS_LENGTH = 5000;
const MONTHS = new Map([
  ["jan", 0],
  ["feb", 1],
  ["mar", 2],
  ["apr", 3],
  ["may", 4],
  ["jun", 5],
  ["jul", 6],
  ["aug", 7],
  ["sep", 8],
  ["oct", 9],
  ["nov", 10],
  ["dec", 11],
]);

function parseDate(rawSms, now) {
  const monthNameMatch = rawSms.match(/\b(\d{1,2})[-/ ]([a-z]{3})[-/ ](\d{2,4})\b/i);
  if (monthNameMatch) {
    const [, rawDay, rawMonth, rawYear] = monthNameMatch;
    const month = MONTHS.get(rawMonth.toLowerCase());
    const day = Number(rawDay);
    const yearNumber = Number(rawYear);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    const parsed = new Date(Date.UTC(year, month, day));

    if (month !== undefined && parsed.getUTCMonth() === month && parsed.getUTCDate() === day) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  const numericDateMatch = rawSms.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (numericDateMatch) {
    const [, year, month, day] = numericDateMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    if (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === numericDateMatch[0]
    ) {
      return numericDateMatch[0];
    }
  }

  const indianDateMatch = rawSms.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (indianDateMatch) {
    const [, rawDay, rawMonth, rawYear] = indianDateMatch;
    const day = Number(rawDay);
    const month = Number(rawMonth) - 1;
    const yearNumber = Number(rawYear);
    const year = yearNumber < 100 ? 2000 + yearNumber : yearNumber;
    const parsed = new Date(Date.UTC(year, month, day));

    if (parsed.getUTCMonth() === month && parsed.getUTCDate() === day) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  return now.toISOString().slice(0, 10);
}

export function parseSms(rawSms, { now = new Date() } = {}) {
  if (typeof rawSms !== "string" || rawSms.trim().length === 0) {
    throw new TypeError("SMS text is required");
  }
  if (rawSms.length > MAX_SMS_LENGTH) {
    throw new RangeError(`SMS text must be ${MAX_SMS_LENGTH} characters or fewer`);
  }

  const transactionType = /\b(credited|credit|received|deposited|refund(?:ed)?)\b/i.test(rawSms)
    ? "CREDIT"
    : /\b(debited|debit|spent|withdrawn|purchase|paid)\b/i.test(rawSms)
      ? "DEBIT"
      : null;
  if (!transactionType) {
    throw new Error("Could not determine whether this transaction is a debit or credit");
  }

  const amountMatch = rawSms.match(/(?:₹|INR\b|Rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) {
    throw new Error("Could not find a transaction amount");
  }
  const amount = Number(amountMatch[1].replaceAll(",", ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Transaction amount must be greater than zero");
  }

  const merchantMatch = rawSms.match(
    /\b(?:to|at|towards)\s+(.+?)(?=\s+\b(?:on|via|from|using|ref(?:erence)?|txn|transaction|upi)\b|[.;]|$)/i
  );
  const merchant = merchantMatch?.[1]?.trim().replace(/\s+/g, " ") || null;

  const maskedAccountMatch = rawSms.match(
    /\b(?:a\/c|account|acct|card)(?:\s*(?:no\.?|number))?\s*(?:x{2,}|\*{2,})\s*(\d{4})\b/i
  );
  const accountMatch =
    maskedAccountMatch ||
    rawSms.match(/\b(?:a\/c|account|acct|card)(?:\s*(?:no\.?|number))?\D{0,8}(\d{4})\b/i);

  return {
    transaction_type: transactionType,
    amount,
    merchant,
    date: parseDate(rawSms, now),
    last_4_digits: accountMatch?.[1] ?? null,
  };
}
