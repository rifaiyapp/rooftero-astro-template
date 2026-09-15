import { resolveRuntimeMount } from "../src/utils/runtime-mount.mjs";

const REVALIDATE = "public, max-age=0, must-revalidate";
const MAX_LEAD_BYTES = 32 * 1024;
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex,nofollow,noarchive,nosnippet",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'none'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'",
};

function leadResponse(status, success = false, extraHeaders = {}) {
  return Response.json(success ? { success: true } : {
    success: false,
    message: "We couldn't send your request. Please try again.",
  }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

// Count actual streamed bytes as Content-Length can be absent or inaccurate.
async function readLeadBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_LEAD_BYTES) {
    throw new RangeError();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LEAD_BYTES) {
        await reader.cancel();
        throw new RangeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const payload = JSON.parse(body);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SyntaxError();
  return body;
}

async function submitLead(request, env, url) {
  if (request.method !== "POST") return leadResponse(405, false, { Allow: "POST" });
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("origin") !== url.origin || (fetchSite && fetchSite !== "same-origin")) {
    return leadResponse(403);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return leadResponse(415);
  }
  let body;
  try {
    body = await readLeadBody(request);
  } catch (error) {
    return leadResponse(error instanceof RangeError ? 413 : 400);
  }
  if (typeof env.LEAD_GATEWAY?.fetch !== "function") return leadResponse(503);

  try {
    const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
    // Preserve browser context and Cloudflare's client IP for gateway spam checks.
    // Do not forward cookies, authorization or client-supplied forwarding headers.
    for (const name of ["origin", "referer", "user-agent", "cf-connecting-ip"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await env.LEAD_GATEWAY.fetch(new Request("https://lead-service.internal/v1/submit", {
      method: "POST", headers, body, redirect: "manual",
    }));
    // Never relay gateway bodies, redirects or headers to the browser.
    if (!response.ok) {
      await response.body?.cancel();
      return leadResponse(response.status === 429 ? 429 : 502);
    }
    const result = JSON.parse(await readLeadBody(response));
    return result.success === true ? leadResponse(200, true) : leadResponse(502);
  } catch {
    return leadResponse(502);
  }
}

// Read on every request: dashboard text (JSON) and JSON bindings both work
// without rebuilding Astro. Invalid configuration approves no nested mounts;
// the root deployment remains available and no partial list is accepted.
function runtimeMounts(value) {
  try {
    const paths = value === undefined ? [] : typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(paths)) throw new TypeError();
    const mounts = paths.map(path => {
      if (typeof path !== "string" || !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]*$/.test(path) ||
          new URL(path, "https://mount.invalid").pathname !== path ||
          /\/(?:assets|_astro|api|thank-you|index\.html)(?:\/|$)/.test(path)) throw new TypeError();
      return path.replace(/\/?$/, "/");
    });
    return [...new Set(["/", ...mounts])].sort((a, b) => b.length - a.length);
  } catch {
    return ["/"];
  }
}

async function notFound(request, env, url, prefix) {
  let pageUrl = new URL(url);
  pageUrl.pathname = "/404.html";
  const pageRequest = new Request(request.url, { method: "GET" });
  let page = await fetchAsset(pageRequest, env, pageUrl);
  // ASSETS applies HTML canonicalization even to internal fetches, commonly
  // /404.html -> /404. Follow only this asset's canonical forms through the
  // binding; never redirect the browser or re-enter the public Worker router.
  const visited = new Set([pageUrl.pathname]);
  while ([301, 302, 303, 307, 308].includes(page.status) && visited.size < 4) {
    let target;
    try {
      const location = page.headers.get("location");
      if (!location) break;
      target = new URL(location, pageUrl);
    } catch { break; }
    if (target.origin !== url.origin || target.username || target.password ||
        !["/404.html", "/404", "/404/", "/404/index.html"].includes(target.pathname) ||
        visited.has(target.pathname)) break;
    visited.add(target.pathname);
    await page.body?.cancel();
    pageUrl = target;
    page = await fetchAsset(pageRequest, env, pageUrl);
  }
  const custom = [200, 404].includes(page.status) && page.headers.get("content-type")?.includes("text/html");
  const headers = new Headers(custom ? page.headers : SECURITY_HEADERS);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  for (const name of ["location", "content-length", "etag"]) headers.delete(name);
  let body = null;
  if (custom) {
    body = prefixLocalAssets(await page.text(), prefix)
      .replace(/href="[^"]*"(?= data-runtime-mount-home(?:[ =>]))/g, `href="${prefix}/"`);
  } else {
    await page.body?.cancel();
  }
  return new Response(request.method === "HEAD" ? null : body, { status: 404, headers });
}

function* mountedAssets(pathname, approvedPrefix) {
  // Cloudflare does not pass the matched route prefix to the Worker. Recognize
  // reserved suffixes first, then try static file suffixes at segment boundaries.
  // Missing files/API paths must never fall through to the landing page.
  const reserved = /\/(?:_astro|assets|api)(?:\/|$)/.exec(pathname);
  if (reserved) {
    if (reserved.index > 0) {
      yield { prefix: pathname.slice(0, reserved.index), pathname: pathname.slice(reserved.index) };
    }
    return;
  }
  const thankYou = /\/thank-you\/?$/.exec(pathname);
  if (thankYou) {
    if (thankYou.index > 0) {
      yield { prefix: resolveRuntimeMount(pathname).slice(0, -1), pathname: "/thank-you/" };
    }
    return;
  }
  for (let slash = pathname.indexOf("/", 1); slash !== -1; slash = pathname.indexOf("/", slash + 1)) {
    if (slash < pathname.length - 1) {
      yield { prefix: pathname.slice(0, slash), pathname: pathname.slice(slash) };
    }
  }
  // Only a configured mount root may fall back to the landing page.
  const prefix = resolveRuntimeMount(pathname).slice(0, -1);
  if (prefix && prefix === approvedPrefix) {
    yield { prefix, pathname: "/" };
  }
}

function withCacheHeaders(response, pathname) {
  const headers = new Headers(response.headers);

  const hashedAsset =
    /^\/_astro\/.+[.-][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(pathname);

  headers.set(
    "Cache-Control",
    response.status >= 400
      ? "no-store"
      : hashedAsset
        ? "public, max-age=31536000, immutable"
        : REVALIDATE
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchAsset(request, env, url) {
  return env.ASSETS.fetch(new Request(new Request(url, request), { redirect: "manual" }));
}

function isRootAssetRedirect(response, url) {
  if (![301, 302, 303, 307, 308].includes(response.status)) return false;
  const location = response.headers.get("location");
  if (!location) return false;
  try {
    const target = new URL(location, url);
    return target.origin === url.origin && target.pathname === "/";
  } catch {
    return false;
  }
}

function prefixLocalAssets(text, prefix) {
  if (!prefix) return text;

  return text
    .replaceAll(`"/_astro/`, `"${prefix}/_astro/`)
    .replaceAll(`'/_astro/`, `'${prefix}/_astro/`)
    .replaceAll(` /_astro/`, ` ${prefix}/_astro/`)
    .replaceAll(`(/_astro/`, `(${prefix}/_astro/`)

    .replaceAll(`"/assets/`, `"${prefix}/assets/`)
    .replaceAll(`'/assets/`, `'${prefix}/assets/`)
    .replaceAll(` /assets/`, ` ${prefix}/assets/`)
    .replaceAll(`(/assets/`, `(${prefix}/assets/`)

    .replaceAll(`"/favicon`, `"${prefix}/favicon`)
    .replaceAll(`'/favicon`, `'${prefix}/favicon`)
    .replaceAll(`(/favicon`, `(${prefix}/favicon`);
}

async function rewriteResponse(response, prefix) {
  if (!prefix || response.status !== 200) {
    return response;
  }

  const contentType = response.headers.get("content-type") || "";

  const rewriteable =
    contentType.includes("text/html") ||
    contentType.includes("text/css");

  if (!rewriteable) {
    return response;
  }

  const body = prefixLocalAssets(await response.text(), prefix);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const originalUrl = new URL(request.url);
    const mounts = runtimeMounts(env.RUNTIME_MOUNT_PATHS);
    const approvedBase = mounts.find(base => originalUrl.pathname === base.slice(0, -1) || originalUrl.pathname.startsWith(base));
    const approvedPrefix = approvedBase.slice(0, -1);
    const relativePath = originalUrl.pathname.slice(approvedPrefix.length) || "/";

    // Dispatch before ASSETS so every mount uses the same fail-closed handler.
    if (/\/api\/lead$/.test(originalUrl.pathname)) {
      if (relativePath !== "/api/lead") return leadResponse(404);
      return submitLead(request, env, originalUrl);
    }

    // Reject unknown documents before ASSETS can redirect or serve an HTML
    // fallback. File and reserved asset paths retain the existing lookup flow.
    const documentRoute = ["/", "/index.html", "/thank-you", "/thank-you/"].includes(relativePath);
    const assetRoute = /^\/(?:assets|_astro)(?:\/|$)/.test(relativePath) || /\/[^/]+\.[^/]+$/.test(relativePath);
    if (!documentRoute && (!assetRoute || /\.html?\/?$/i.test(relativePath) || /^\/api(?:\/|$)/.test(relativePath))) {
      return notFound(request, env, originalUrl, approvedPrefix);
    }

    const mountBase = resolveRuntimeMount(originalUrl.pathname);
    const mountRootWithoutSlash = approvedPrefix && originalUrl.pathname === approvedPrefix;
    if ((request.method === "GET" || request.method === "HEAD") && mountRootWithoutSlash) {
      // Canonicalize before ASSETS can redirect an unknown path to the origin
      // root. An origin-relative Location preserves the host and exact query.
      return withCacheHeaders(new Response(null, {
        status: 308,
        headers: { ...SECURITY_HEADERS, Location: mountBase + originalUrl.search },
      }), originalUrl.pathname);
    }

    // Normal root deployment first.
    let response = await fetchAsset(request, env, originalUrl);

    // The asset binding may canonicalize an unknown extensionless path to /.
    // Resolve that mount against the root asset internally instead of letting
    // its Location header take the browser outside the Worker's route.
    if ((request.method === "GET" || request.method === "HEAD") && isRootAssetRedirect(response, originalUrl)) {
      const mount = [...mountedAssets(originalUrl.pathname, approvedPrefix)].find(asset => asset.prefix === approvedPrefix && asset.pathname === "/");
      if (mount) {
        const rootUrl = new URL(originalUrl);
        rootUrl.pathname = "/";
        await response.body?.cancel();
        response = await rewriteResponse(await fetchAsset(request, env, rootUrl), mount.prefix);
        return withCacheHeaders(response, "/");
      }
    }

    if (response.status !== 404) {
      return withCacheHeaders(response, originalUrl.pathname);
    }

    if (request.method === "GET" || request.method === "HEAD") {
      for (const mount of mountedAssets(originalUrl.pathname, approvedPrefix)) {
        if (mount.prefix !== approvedPrefix) continue;
        const rewrittenUrl = new URL(originalUrl);
        rewrittenUrl.pathname = mount.pathname;
        const candidate = await fetchAsset(request, env, rewrittenUrl);
        if (candidate.status === 404) {
          await candidate.body?.cancel();
          continue;
        }
        await response.body?.cancel();
        response = await rewriteResponse(candidate, mount.prefix);
        return withCacheHeaders(response, mount.pathname);
      }
    }
    return withCacheHeaders(response, originalUrl.pathname);
  },
};
