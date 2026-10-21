import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const CategoryChart = lazy(() =>
  import("./Charts.jsx").then((module) => ({ default: module.CategoryChart }))
);
const DailyChart = lazy(() =>
  import("./Charts.jsx").then((module) => ({ default: module.DailyChart }))
);
const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

export default function App() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [sms, setSms] = useState("");
  const [category, setCategory] = useState("All categories");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const [summaryResponse, transactionsResponse] = await Promise.all([
        fetch("/api/dashboard-summary", { credentials: "include" }),
        fetch("/api/transactions?limit=500", { credentials: "include" }),
      ]);
      if (summaryResponse.status === 401 || transactionsResponse.status === 401) {
        setAuthenticated(false);
        setSummary(null);
        setTransactions([]);
        setError("Your session expired. Please sign in again.");
        return;
      }
      if (!summaryResponse.ok || !transactionsResponse.ok) {
        throw new Error("Could not load your transactions. Check that the local API is running.");
      }
      const [nextSummary, nextTransactions] = await Promise.all([
        summaryResponse.json(),
        transactionsResponse.json(),
      ]);
      setSummary(nextSummary);
      setTransactions(nextTransactions.transactions);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/auth/session", { credentials: "include" });
        if (!response.ok) throw new Error("Could not connect to the transaction tracker API.");
        const result = await response.json();
        setAuthenticated(result.authenticated);
        if (result.authenticated) await loadDashboard();
      } catch (sessionError) {
        setError(sessionError.message);
      } finally {
        setAuthLoading(false);
        setLoading(false);
      }
    }

    checkSession();
  }, []);

  async function submitLogin(event) {
    event.preventDefault();
    setAuthSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sign in.");
      setAuthenticated(true);
      setPassword("");
      await loadDashboard();
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setAuthSubmitting(false);
      setAuthLoading(false);
    }
  }

  async function logout() {
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) throw new Error("Could not sign out.");
      setAuthenticated(false);
      setTransactions([]);
      setSummary(null);
    } catch (logoutError) {
      setError(logoutError.message);
    }
  }

  const visibleTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesCategory = category === "All categories" || transaction.category === category;
        const searchable = `${transaction.merchant ?? ""} ${transaction.category}`.toLowerCase();
        return matchesCategory && searchable.includes(query.trim().toLowerCase());
      }),
    [category, query, transactions]
  );

  async function submitSms(event) {
    event.preventDefault();
    if (!sms.trim()) {
      setError("Paste a transaction SMS first.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/parse-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rawSms: sms }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Could not parse this message.");
      }
      setSms("");
      setNotice(
        `Saved ${CURRENCY.format(result.transaction.amount)} at ${result.transaction.merchant ?? "Unknown merchant"}.`
      );
      await loadDashboard();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function loadSmsFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10_000) {
      setError("Text files must be 10 KB or smaller.");
      event.target.value = "";
      return;
    }
    setSms(await file.text());
    setError("");
    event.target.value = "";
  }

  const chartDays =
    summary?.dailySpending.map((entry) => ({
      ...entry,
      label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(
        new Date(`${entry.date}T00:00:00`)
      ),
    })) ?? [];

  if (authLoading || (authenticated && loading && !summary)) {
    return (
      <main className="page-shell min-h-screen">
        <div className="loading-screen">Loading your private dashboard…</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="page-shell min-h-screen">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Rupee dashboard">
            <span className="brand-mark">₹</span>
            <span>
              rupee<span className="brand-period">.</span>
            </span>
          </a>
          <div className="topbar-note">
            <span className="status-dot" /> Private, on this device
          </div>
        </header>
        <section className="login-card">
          <p className="eyebrow">PRIVATE FINANCIAL DASHBOARD</p>
          <h1>
            Welcome <span>back.</span>
          </h1>
          <p className="login-description">Sign in to view your encrypted transactions.</p>
          {error && (
            <div className="message error-message" role="alert">
              {error}
            </div>
          )}
          <form className="login-form" onSubmit={submitLogin}>
            <label htmlFor="app-password">Password</label>
            <input
              autoComplete="current-password"
              id="app-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <button className="submit-button" disabled={authSubmitting} type="submit">
              {authSubmitting ? "Signing in…" : "Sign in"} <span>→</span>
            </button>
          </form>
          <p className="privacy-note">
            Your password is checked by the API and is never stored in the database.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell min-h-screen">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Rupee dashboard">
          <span className="brand-mark">₹</span>
          <span>
            rupee<span className="brand-period">.</span>
          </span>
        </a>
        <button className="logout-button" onClick={logout} type="button">
          Sign out
        </button>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">YOUR MONEY, IN ONE PLACE</p>
          <h1>
            A clearer view of
            <br />
            <span>your spending.</span>
          </h1>
        </div>
        <div className="welcome-month">
          {summary?.month ?? "This month"} <span>⌄</span>
        </div>
      </section>

      {error && (
        <div className="message error-message" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="message success-message" role="status">
          {notice}
        </div>
      )}

      <section className="stats-grid" aria-label="Monthly overview">
        <article className="stat-card primary-stat">
          <div className="stat-heading">
            <span>Monthly spend</span>
            <span className="stat-icon">↗</span>
          </div>
          <strong>{loading ? "—" : CURRENCY.format(summary?.monthlyTotal ?? 0)}</strong>
          <small>Debits recorded this month</small>
        </article>
        <article className="stat-card">
          <div className="stat-heading">
            <span>Top category</span>
            <span className="stat-icon muted-icon">◉</span>
          </div>
          <strong>{loading ? "—" : (summary?.topCategory ?? "No spend yet")}</strong>
          <small>
            {summary?.categoryBreakdown[0]
              ? CURRENCY.format(summary.categoryBreakdown[0].total)
              : "Your categories will appear here"}
          </small>
        </article>
        <article className="stat-card">
          <div className="stat-heading">
            <span>Transactions</span>
            <span className="stat-icon muted-icon">▤</span>
          </div>
          <strong>{loading ? "—" : (summary?.transactionCount ?? 0)}</strong>
          <small>For {summary?.month ?? "this month"}</small>
        </article>
      </section>

      <section className="content-grid">
        <article className="panel import-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">QUICK ADD</p>
              <h2>Import a bank SMS</h2>
            </div>
            <span className="heading-badge">01</span>
          </div>
          <p className="panel-description">
            Paste a transaction alert. We’ll pick out the details and keep them encrypted on your
            device.
          </p>
          <form onSubmit={submitSms}>
            <label className="sr-only" htmlFor="sms-input">
              Bank transaction SMS
            </label>
            <textarea
              id="sms-input"
              maxLength={5000}
              onChange={(event) => setSms(event.target.value)}
              placeholder={"e.g. A/c XX1234 debited INR 500 via UPI to Chai Point on 12-Oct-26"}
              value={sms}
            />
            <div className="form-actions">
              <label className="upload-button">
                <span>＋</span> Upload .txt
                <input accept=".txt,text/plain" onChange={loadSmsFile} type="file" />
              </label>
              <button className="submit-button" disabled={submitting} type="submit">
                {submitting ? "Saving…" : "Parse & save"} <span>→</span>
              </button>
            </div>
          </form>
          <p className="privacy-note">
            <span>▣</span> SMS content is never stored after parsing.
          </p>
        </article>

        <article className="panel category-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">AT A GLANCE</p>
              <h2>Spending mix</h2>
            </div>
            <span className="heading-badge">02</span>
          </div>
          {summary?.categoryBreakdown.length ? (
            <Suspense fallback={<div className="empty-chart">Loading chart…</div>}>
              <CategoryChart data={summary.categoryBreakdown} currency={CURRENCY} />
            </Suspense>
          ) : (
            <div className="empty-chart">Your spending categories will show up here.</div>
          )}
        </article>
      </section>

      <section className="panel spending-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SPENDING PACE</p>
            <h2>Daily spending</h2>
          </div>
          <span className="panel-subtitle">This month</span>
        </div>
        {chartDays.length ? (
          <div className="bar-chart">
            <Suspense fallback={<div className="empty-chart daily-empty">Loading chart…</div>}>
              <DailyChart data={chartDays} currency={CURRENCY} />
            </Suspense>
          </div>
        ) : (
          <div className="empty-chart daily-empty">
            No debit activity yet. Add an SMS to get started.
          </div>
        )}
      </section>

      <section className="panel history-panel">
        <div className="history-heading">
          <div>
            <p className="eyebrow">YOUR ACTIVITY</p>
            <h2>
              Transactions <span className="count-pill">{visibleTransactions.length}</span>
            </h2>
          </div>
          <div className="filters">
            <label className="search-field">
              <span>⌕</span>
              <input
                aria-label="Search transactions"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search merchant"
                value={query}
              />
            </label>
            <label className="sr-only" htmlFor="category-filter">
              Filter by category
            </label>
            <select
              id="category-filter"
              onChange={(event) => setCategory(event.target.value)}
              value={category}
            >
              <option>All categories</option>
              {[...new Set(transactions.map((transaction) => transaction.category))]
                .sort()
                .map((value) => (
                  <option key={value}>{value}</option>
                ))}
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MERCHANT</th>
                <th>CATEGORY</th>
                <th>DATE</th>
                <th>ACCOUNT</th>
                <th className="amount-column">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <span className="merchant-mark">
                      {(transaction.merchant ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="merchant-name">
                      {transaction.merchant ?? "Unknown merchant"}
                    </span>
                  </td>
                  <td>
                    <span className={`category-tag category-${transaction.category.toLowerCase()}`}>
                      {transaction.category}
                    </span>
                  </td>
                  <td className="date-cell">{formatDate(transaction.date)}</td>
                  <td className="account-cell">{transaction.last_4_digits ?? "—"}</td>
                  <td
                    className={`amount-cell ${transaction.transaction_type === "CREDIT" ? "credit-amount" : ""}`}
                  >
                    {transaction.transaction_type === "CREDIT" ? "+" : "−"}
                    {CURRENCY.format(transaction.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleTransactions.length && (
            <div className="empty-table">
              {loading ? "Loading transactions…" : "No matching transactions yet."}
            </div>
          )}
        </div>
      </section>
      <footer className="footer-note">
        <span>₹</span> Your financial data stays local and encrypted.
      </footer>
    </main>
  );
}
