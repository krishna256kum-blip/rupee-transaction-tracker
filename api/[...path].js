const ALLOWED_METHODS = new Set(["GET", "POST"]);

export default async function handler(request, response) {
  if (!ALLOWED_METHODS.has(request.method)) {
    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const configuredOrigin = process.env.TRANSACTION_API_ORIGIN;
  if (!configuredOrigin) {
    return response.status(503).json({ error: "Transaction API is not configured" });
  }

  let apiOrigin;
  let target;
  try {
    apiOrigin = new URL(configuredOrigin);
    const requestUrl = new URL(request.url, "https://vercel.invalid");
    if (
      apiOrigin.protocol !== "https:" ||
      apiOrigin.username ||
      apiOrigin.password ||
      requestUrl.origin !== "https://vercel.invalid" ||
      !requestUrl.pathname.startsWith("/api/")
    ) {
      return response.status(400).json({ error: "Invalid API proxy target" });
    }
    target = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
  } catch {
    return response.status(500).json({ error: "Transaction API configuration is invalid" });
  }

  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "origin"]) {
    const value = request.headers[name];
    if (typeof value === "string") headers.set(name, value);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? JSON.stringify(request.body ?? {}) : undefined,
      redirect: "manual",
    });

    response.status(upstream.status);
    response.setHeader("Cache-Control", "no-store");
    const contentType = upstream.headers.get("content-type");
    if (contentType) response.setHeader("Content-Type", contentType);
    const setCookies = upstream.headers.getSetCookie();
    if (setCookies.length) response.setHeader("Set-Cookie", setCookies);

    return response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error("Transaction API proxy request failed", error);
    return response.status(502).json({ error: "Transaction API is unavailable" });
  }
}
