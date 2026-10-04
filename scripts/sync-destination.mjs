import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerPath = new URL("../wrangler.jsonc", import.meta.url);
const projectConfigPath = new URL("../project.config.json", import.meta.url);
const leadConfigPath = new URL("../src/config/lead.ts", import.meta.url);

function getRepositoryName() {
  try {
    const remote = execFileSync("git", ["config", "--local", "--get", "remote.origin.url"], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    const match = remote.match(/[/:]([a-zA-Z0-9][a-zA-Z0-9._-]*?)(?:\.git)?\/?$/);
    if (match) return match[1];
  } catch {

  }

  for (const value of [process.env.CODEX_GITHUB_REPOSITORY, process.env.GITHUB_REPOSITORY]) {
    const match = value?.trim().match(/^[^/\s]+\/([a-zA-Z0-9][a-zA-Z0-9._-]*)$/);
    if (match) return match[1];
  }
  return null;
}

function normalizeTechnicalId(repositoryName) {
  const withoutTemplateSuffix = repositoryName.replace(/-astro-template$/i, "");
  const normalized = withoutTemplateSuffix
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(normalized)) {
    throw new Error("Destination repository does not produce a valid technical ID (1-63 lowercase letters, digits, underscores or hyphens).");
  }
  return normalized;
}

function replaceLeadIdentity(source, projectId, formId) {
  const projectPattern = /projectId:\s*'[^']*'/;
  const formPattern = /formId:\s*'[^']*'/;
  if (!projectPattern.test(source) || !formPattern.test(source)) {
    throw new Error("Configuration format is invalid.");
  }
  return source
    .replace(projectPattern, "projectId: '" + projectId + "'")
    .replace(formPattern, "formId: '" + formId + "'");
}

const repositoryName = getRepositoryName();

if (!repositoryName) {
  console.log("Project sync skipped: repository identity unavailable.");
  process.exit(0);
}

const technicalId = normalizeTechnicalId(repositoryName);
const leadProjectId = technicalId;
const leadFormId = technicalId + "-lead";
if (leadFormId.length > 100) throw new Error("Generated form ID is too long.");

const projectRaw = fs.readFileSync(projectConfigPath, "utf8");
const projectConfig = JSON.parse(projectRaw);
const basePath = process.env.DEPLOYMENT_BASE_PATH?.trim() || projectConfig.deployment?.basePath || "/";
if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath) ||
    new URL(basePath, "https://mount.invalid").pathname !== basePath || basePath.startsWith("//")) {
  throw new Error("Deployment base path must be a normalized path with leading and trailing slashes.");
}

const wranglerRaw = fs.readFileSync(wranglerPath, "utf8");
const wranglerUpdated = wranglerRaw.replace(
  /"name"\s*:\s*"[^"]+"/,
  '"name": "' + technicalId + '"'
);

const leadRaw = fs.readFileSync(leadConfigPath, "utf8");
const leadUpdated = replaceLeadIdentity(leadRaw, leadProjectId, leadFormId);

const projectChanged = projectConfig.name !== repositoryName ||
  projectConfig.deployment?.basePath !== basePath;

projectConfig.name = repositoryName;
projectConfig.deployment ??= {};
projectConfig.deployment.basePath = basePath;

if (wranglerUpdated !== wranglerRaw) fs.writeFileSync(wranglerPath, wranglerUpdated);
if (leadUpdated !== leadRaw) fs.writeFileSync(leadConfigPath, leadUpdated);
if (projectChanged) {
  const newline = projectRaw.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(projectConfigPath, (JSON.stringify(projectConfig, null, 2) + "\n").replaceAll("\n", newline));
}

console.log("Project configuration synchronized.");
