import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerPath = new URL("../wrangler.jsonc", import.meta.url);
const projectConfigPath = new URL("../project.config.json", import.meta.url);

function getRepositoryName() {
  try {
    const remote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    const match = remote.match(
      /[/:]([a-zA-Z0-9][a-zA-Z0-9._-]*?)(?:\.git)?\/?$/
    );

    if (match) return match[1];
  } catch {
    // Cloud checkouts may have no origin; use only explicit repository fallbacks.
  }

  for (const value of [process.env.CODEX_GITHUB_REPOSITORY, process.env.GITHUB_REPOSITORY]) {
    const match = value?.trim().match(/^[^/\s]+\/([a-zA-Z0-9][a-zA-Z0-9._-]*)$/);
    if (match) return match[1];
  }
  return null;
}

function getBasePath(repositoryName) {
  if (!repositoryName) return "/";

  if (repositoryName.endsWith("-astro-template")) {
    return "/";
  }

  const shibgaMatch = repositoryName.match(/^shibga-(.+)-lp-(\d+)$/);

  if (shibgaMatch) {
    const [, service, number] = shibgaMatch;
    return `/lp/${service}-${number}/`;
  }

  return "/";
}

const repositoryName = getRepositoryName();

if (!repositoryName) {
  console.log("Destination sync skipped: repository identity unavailable.");
  process.exit(0);
}

const workerName = repositoryName.replace(/-astro-template$/, "").toLowerCase();

if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(workerName)) {
  throw new Error("Destination repository does not produce a valid Worker name.");
}

const basePath =
  repositoryName.endsWith("-astro-template") ? "/" :
    process.env.DEPLOYMENT_BASE_PATH?.trim() || getBasePath(repositoryName);

// Sync wrangler Worker name.
const wranglerRaw = fs.readFileSync(wranglerPath, "utf8");

const wranglerUpdated = wranglerRaw.replace(
  /"name"\s*:\s*"[^"]+"/,
  `"name": "${workerName}"`
);

// Keep technical identity separate from visible branding and Lead Service IDs.
const projectRaw = fs.readFileSync(projectConfigPath, "utf8");
const projectConfig = JSON.parse(projectRaw);
const projectChanged = projectConfig.name !== repositoryName ||
  projectConfig.deployment?.basePath !== basePath;

projectConfig.name = repositoryName;
projectConfig.deployment ??= {};
projectConfig.deployment.basePath = basePath;

if (wranglerUpdated !== wranglerRaw) fs.writeFileSync(wranglerPath, wranglerUpdated);
if (projectChanged) {
  const newline = projectRaw.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(projectConfigPath, `${JSON.stringify(projectConfig, null, 2)}\n`.replaceAll("\n", newline));
}

console.log(`Worker name synchronized: ${workerName}`);
console.log(`Deployment base path synchronized: ${basePath}`);
