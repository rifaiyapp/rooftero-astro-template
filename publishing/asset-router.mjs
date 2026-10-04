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
  const payload = JSON.parse(body);
  if (![payload.project_id, payload.form_id].every(id => typeof id === "string" && id.trim()) ||
      typeof env.LEAD_GATEWAY?.fetch !== "function") return leadResponse(503);

  try {
    const headers = new Headers({ "Content-Type": "application/json", Accept: "application/json" });
    for (const name of ["origin", "referer", "user-agent", "cf-connecting-ip"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await env.LEAD_GATEWAY.fetch(new Request("https://lead-service.internal/v1/submit", {
      method: "POST", headers, body, redirect: "manual",
    }));
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
    body = prefixLocalNavigation(prefixLocalAssets(await page.text(), prefix), prefix)
      .replace(/href="[^"]*"(?= data-runtime-mount-home(?:[ =>]))/g, `href="${prefix}/"`);
  } else {
    await page.body?.cancel();
  }
  return new Response(request.method === "HEAD" ? null : body, { status: 404, headers });
}

function* mountedAssets(pathname, approvedPrefix) {
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
  const prefix = resolveRuntimeMount(pathname).slice(0, -1);
  if (prefix && prefix === approvedPrefix) {
    yield { prefix, pathname: "/" };
  }
}

function withCacheHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  const hashedAsset = /^\/_astro\/.+[.-][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(pathname);
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

function prefixLocalNavigation(text, prefix) {
  if (!prefix) return text;
  return text.replace(
    /(<a\b[^>]*\bhref=)(["'])\/(?!\/)([^"']*)\2/gi,
    (match, before, quote, rest) => {
      const path = "/" + rest;
      if (path === prefix || path.startsWith(prefix + "/")) return match;
      return before + quote + prefix + path + quote;
    }
  );
}

async function rewriteResponse(response, prefix) {
  if (!prefix || response.status !== 200) return response;
  const contentType = response.headers.get("content-type") || "";
  const rewriteable = contentType.includes("text/html") || contentType.includes("text/css");
  if (!rewriteable) return response;
  let body = prefixLocalNavigation(prefixLocalAssets(await response.text(), prefix), prefix)
    .replace(/href="[^"]*"(?= data-runtime-mount-home(?:[ =>]))/g, `href="${prefix}/"`);
  if (contentType.includes("text/html")) {
    body = body.replace(/<html(\s|>)/i, `<html data-runtime-mount="${prefix}/"$1`);
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isDocumentPath(pathname) {
  if (/^\/(?:assets|_astro|api)(?:\/|$)/.test(pathname)) return false;
  return !/\/[^/]+\.[^/]+$/.test(pathname) || /\.html?$/i.test(pathname);
}

function isRedirect(response) {
  return [301, 302, 303, 307, 308].includes(response.status);
}

function redirectTarget(response, url) {
  const location = response.headers.get("location");
  if (!location) return null;
  try {
    const target = new URL(location, url);
    if (target.origin !== url.origin || target.username || target.password) return null;
    return target;
  } catch {
    return null;
  }
}

function mountedUrl(originalUrl, relativePath) {
  const url = new URL(originalUrl);
  url.pathname = relativePath;
  return url;
}

async function confirmedSlashRedirect(request, env, originalUrl, relativePath) {
  if (relativePath === "/" || relativePath.endsWith("/") || /\.html?$/i.test(relativePath)) return null;
  const candidateUrl = mountedUrl(originalUrl, relativePath + "/");
  const candidate = await fetchAsset(request, env, candidateUrl);
  const isHtml = candidate.status === 200 && candidate.headers.get("content-type")?.includes("text/html");
  await candidate.body?.cancel();
  if (!isHtml) return null;
  return withCacheHeaders(new Response(null, {
    status: 308,
    headers: { ...SECURITY_HEADERS, Location: originalUrl.pathname + "/" + originalUrl.search },
  }), originalUrl.pathname);
}

export default {
  async fetch(request, env) {
    const originalUrl = new URL(request.url);
    const mounts = runtimeMounts(env.RUNTIME_MOUNT_PATHS);
    const approvedBase = mounts.find(base =>
      originalUrl.pathname === base.slice(0, -1) || originalUrl.pathname.startsWith(base)
    ) || "/";
    const approvedPrefix = approvedBase.slice(0, -1);
    const relativePath = originalUrl.pathname.slice(approvedPrefix.length) || "/";

    if (/\/api\/lead$/.test(originalUrl.pathname)) {
      if (relativePath !== "/api/lead") return leadResponse(404);
      return submitLead(request, env, originalUrl);
    }
    if (/^\/api(?:\/|$)/.test(relativePath)) return leadResponse(404);

    const mountRootWithoutSlash = approvedPrefix && originalUrl.pathname === approvedPrefix;
    if ((request.method === "GET" || request.method === "HEAD") && mountRootWithoutSlash) {
      return withCacheHeaders(new Response(null, {
        status: 308,
        headers: { ...SECURITY_HEADERS, Location: approvedBase + originalUrl.search },
      }), originalUrl.pathname);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = await fetchAsset(request, env, originalUrl);
      return withCacheHeaders(response, originalUrl.pathname);
    }

    const documentRoute = isDocumentPath(relativePath);
    const assetUrl = approvedPrefix ? mountedUrl(originalUrl, relativePath) : originalUrl;

    if (approvedPrefix && relativePath === "/thank-you") {
      const thankYouUrl = mountedUrl(originalUrl, "/thank-you/");
      const thankYou = await fetchAsset(request, env, thankYouUrl);
      if (thankYou.status === 200) {
        return withCacheHeaders(await rewriteResponse(thankYou, approvedPrefix), "/thank-you/");
      }
      await thankYou.body?.cancel();
      return notFound(request, env, originalUrl, approvedPrefix);
    }

    let response = await fetchAsset(request, env, assetUrl);

    if (!documentRoute) {
      if (approvedPrefix && response.status === 200) {
        response = await rewriteResponse(response, approvedPrefix);
      }
      return withCacheHeaders(response, relativePath);
    }

    if (isRootAssetRedirect(response, assetUrl) && relativePath !== "/") {
      await response.body?.cancel();
      const redirect = await confirmedSlashRedirect(request, env, originalUrl, relativePath);
      if (redirect) return redirect;
      return notFound(request, env, originalUrl, approvedPrefix);
    }

    if (response.status === 404) {
      await response.body?.cancel();
      const redirect = await confirmedSlashRedirect(request, env, originalUrl, relativePath);
      if (redirect) return redirect;
      return notFound(request, env, originalUrl, approvedPrefix);
    }

    if (isRedirect(response) && approvedPrefix) {
      const target = redirectTarget(response, assetUrl);
      if (!target) {
        await response.body?.cancel();
        return notFound(request, env, originalUrl, approvedPrefix);
      }
      if (target.pathname === "/" && relativePath !== "/") {
        await response.body?.cancel();
        return notFound(request, env, originalUrl, approvedPrefix);
      }
      const location = approvedPrefix + target.pathname + target.search + target.hash;
      const headers = new Headers(response.headers);
      headers.set("Location", location);
      return withCacheHeaders(new Response(null, { status: response.status, headers }), originalUrl.pathname);
    }

    if (approvedPrefix && response.status === 200) {
      response = await rewriteResponse(response, approvedPrefix);
    }
    return withCacheHeaders(response, relativePath);
  },
};
