const BACKEND = process.env.COMMENT_BACKEND_URL || "http://127.0.0.1:58643/api/comments";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context) {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`${BACKEND}/${path.map(encodeURIComponent).join("/")}`);
  target.search = incoming.search;

  const headers = new Headers();
  for (const name of ["content-type", "cookie", "x-csrf-token", "x-forwarded-for"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-forwarded-public-origin", incoming.origin);

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
    cache: "no-store",
  });
  const responseHeaders = new Headers({ "Cache-Control": "no-store" });
  for (const name of ["content-type", "location"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const cookieHeaders = (upstream.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  if (cookieHeaders.length) cookieHeaders.forEach((cookie) => responseHeaders.append("set-cookie", cookie));
  else if (upstream.headers.get("set-cookie")) responseHeaders.set("set-cookie", upstream.headers.get("set-cookie")!);
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const dynamic = "force-dynamic";
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
