/**
 * Resolve the mount shared by a landing page and its lead/thank-you routes.
 * Accept a pathname, never a build base or origin; return one leading slash
 * and one trailing slash so derived URLs stay on the current origin.
 * @param {string} pathname
 * @returns {string}
 */
export function resolveRuntimeMount(pathname) {
  const parts = pathname.replaceAll("\\", "/").split(/[?#]/, 1)[0].split("/").filter(Boolean);
  if (parts.at(-1) === "index.html") parts.pop();
  if (parts.at(-1) === "thank-you") parts.pop();
  else if (parts.at(-2) === "api" && parts.at(-1) === "lead") parts.splice(-2);
  return parts.length ? `/${parts.join("/")}/` : "/";
}
