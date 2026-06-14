#!/usr/bin/env node
/**
 * VibeBridge CLI. Get your AI-built website online and editable in minutes.
 *
 * VibeBridge is the post-build layer for websites built with AI coding tools.
 * Bring a finished HTML site. VibeBridge hosts it, makes every text and image
 * editable by the owner, captures leads from forms, and reports analytics.
 * It is not a website builder.
 *
 * Commands:
 *   vibebridge whoami            Check your API key and list your sites
 *   vibebridge init              Create a vibebridge.json in the current folder
 *   vibebridge check [file]      Lint a page locally (and on the server if a key is set)
 *   vibebridge deploy            Upload the pages in vibebridge.json and publish
 *   vibebridge push <file>       Upload a single page
 *
 * Auth:
 *   --key <k>  flag, then VIBEBRIDGE_API_KEY env, then ~/.vibebridge/config.json apiKey.
 *   Customer keys start with vbb_live_. Generate one in the portal under
 *   your site -> Integrations.
 *
 * Endpoint:
 *   --endpoint <url> flag, then vibebridge.json endpoint, then
 *   ~/.vibebridge/config.json endpoint, then default https://app.vibebridge.ai.
 *
 * Docs: https://vibebridge.ai  Sign up: https://app.vibebridge.ai/signup
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { argv, cwd, exit, env } from "node:process";

const DEFAULT_ENDPOINT = "https://app.vibebridge.ai";
const SIGNUP_URL = "https://app.vibebridge.ai/signup";
const WEBSITE_URL = "https://vibebridge.ai";

// ─── Exit codes ──────────────────────────────────────────────────────────
// 0 success; 1 usage/config error; 2 connectivity/auth failure;
// 3 upload/publish failure; 99 unexpected.
const EXIT = { OK: 0, USAGE: 1, AUTH: 2, PUBLISH: 3, UNEXPECTED: 99 };

// ─── ANSI colors (only when stdout is a TTY) ─────────────────────────────
const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? "\x1b[0m" : "",
  bold: isTTY ? "\x1b[1m" : "",
  dim: isTTY ? "\x1b[2m" : "",
  red: isTTY ? "\x1b[31m" : "",
  green: isTTY ? "\x1b[32m" : "",
  yellow: isTTY ? "\x1b[33m" : "",
  blue: isTTY ? "\x1b[34m" : "",
  cyan: isTTY ? "\x1b[36m" : "",
};

const log = {
  ok: (m) => console.log(`${c.green}✓${c.reset} ${m}`),
  fail: (m) => console.error(`${c.red}✗${c.reset} ${m}`),
  info: (m) => console.log(`${c.cyan}›${c.reset} ${m}`),
  warn: (m) => console.warn(`${c.yellow}⚠${c.reset} ${m}`),
  dim: (m) => console.log(`${c.dim}${m}${c.reset}`),
  plain: (m) => console.log(m),
};

// ─── Asset collection (relative image refs -> base64) ────────────────────
// Without this, a `<img src="portrait.jpg">` resolves to nothing on the
// deployed site and the image silently disappears. We read the referenced
// LOCAL image files, base64 them, and send them in `assets` so VibeBridge
// uploads them and rewrites the HTML.
const IMG_EXT = /\.(?:jpe?g|png|gif|webp|svg|avif|ico|bmp)$/i;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

function isLocalRef(p) {
  if (!p) return false;
  if (/^(?:https?:)?\/\//i.test(p)) return false; // absolute or protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false; // data:, mailto:, tel:, ...
  if (p.startsWith("#") || p.startsWith("/")) return false; // anchor / site-absolute
  return true;
}

function collectAssetRefs(html) {
  const refs = new Set();
  const add = (raw) => {
    if (!raw) return;
    const p = raw.trim().split(/[?#]/)[0];
    if (isLocalRef(p) && IMG_EXT.test(p)) refs.add(p);
  };
  for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi))
    for (const cand of m[1].split(",")) add(cand.trim().split(/\s+/)[0]);
  for (const m of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(m[1]);
  return [...refs];
}

/** Read + base64 every existing referenced image; report missing/oversized. */
function buildAssets(html, baseDir) {
  const assets = [];
  const missing = [];
  for (const ref of collectAssetRefs(html)) {
    const filePath = resolve(baseDir, ref.replace(/^\.?\/+/, ""));
    if (!existsSync(filePath)) {
      missing.push(ref);
      continue;
    }
    try {
      const buf = readFileSync(filePath);
      if (buf.length > MAX_ASSET_BYTES) {
        missing.push(`${ref} (over 10MB, skipped)`);
        continue;
      }
      assets.push({ path: ref, contentBase64: buf.toString("base64") });
    } catch {
      missing.push(ref);
    }
  }
  return { assets, missing };
}

// ─── Small helpers ───────────────────────────────────────────────────────
function titleCase(s) {
  return String(s)
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function slugFromFile(file) {
  const base = basename(file).replace(/\.[^.]+$/, "");
  return base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "page";
}

function readJsonFile(path) {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw);
}

function userConfig() {
  const path = join(homedir(), ".vibebridge", "config.json");
  if (!existsSync(path)) return {};
  try {
    return readJsonFile(path) || {};
  } catch {
    log.warn(`Could not parse ${path}, ignoring it.`);
    return {};
  }
}

// ─── Argv parsing ────────────────────────────────────────────────────────
// Returns { _: [positionals], flags... } with both --flag value and boolean
// flags resolved. Known value flags consume the next token.
function parseArgs(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    // Support both "--flag value" and "--flag=value". For =value, the value is
    // consumed inline; otherwise a value flag takes the next token.
    let inlineVal;
    if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      inlineVal = a.slice(eq + 1);
      a = a.slice(0, eq);
    }
    const takeVal = () => (inlineVal !== undefined ? inlineVal : args[++i]);
    if (a === "--key") out.key = takeVal();
    else if (a === "--endpoint") out.endpoint = takeVal();
    else if (a === "--config" || a === "-c") out.config = takeVal();
    else if (a === "--site") out.site = takeVal();
    else if (a === "--page") out.page = takeVal();
    else if (a === "--path") out.path = takeVal();
    else if (a === "--slug") out.slug = takeVal();
    else if (a === "--label") out.label = takeVal();
    else if (a === "--sort") out.sort = takeVal();
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-publish") out.noPublish = true;
    else if (a === "--publish") out.publish = true;
    else if (a === "--check") out.check = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--version" || a === "-v") out.version = true;
    else if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      // Anything else that looks like a flag is unknown. A bare "-" or a
      // negative number is treated as a positional.
      throw new UsageError(`Unknown option: ${args[i]}`);
    } else {
      out._.push(a);
    }
  }
  return out;
}

class UsageError extends Error {}

// ─── Auth + endpoint resolution ──────────────────────────────────────────
function resolveKey(flags) {
  const uc = userConfig();
  return flags.key || env.VIBEBRIDGE_API_KEY || uc.apiKey || null;
}

function resolveEndpoint(flags, configEndpoint) {
  const uc = userConfig();
  const base =
    flags.endpoint || configEndpoint || uc.endpoint || DEFAULT_ENDPOINT;
  return String(base).replace(/\/+$/, "");
}

function requireKey(flags) {
  const key = resolveKey(flags);
  if (!key) {
    log.fail(
      "No API key found.\n" +
        "  Pass --key vbb_live_..., or set VIBEBRIDGE_API_KEY, or store it in ~/.vibebridge/config.json.\n" +
        `  New here? Sign up and create a key at ${SIGNUP_URL}`
    );
    exit(EXIT.AUTH);
  }
  if (!key.startsWith("vbb_live_")) {
    log.warn(
      "Your key does not start with vbb_live_. Customer keys from the portal use that prefix."
    );
  }
  return key;
}

// ─── MCP core helper ─────────────────────────────────────────────────────
let rpcId = 0;

/**
 * Call a VibeBridge MCP tool over JSON-RPC and return its parsed data.
 * Applies the response-parsing rule:
 *   1. top-level error -> protocol error (code -32001 = unauthorized).
 *   2. result.isError === true -> tool failure, message in content[0].text.
 *   3. else data = result.structuredContent ?? JSON.parse(result.content[0].text).
 */
async function mcpCall(base, key, name, args) {
  const url = `${base}/api/mcp`;
  const body = {
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "tools/call",
    params: { name, arguments: args || {} },
  };

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Cannot reach ${url}: ${e.message}`);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error(
      `Unexpected response from ${url} (HTTP ${res.status} ${res.statusText}, not JSON).`
    );
  }

  // 1. Protocol-level error.
  if (payload && payload.error) {
    const code = payload.error.code;
    if (code === -32001) {
      throw new Error(
        "Unauthorized. Check your API key (it should start with vbb_live_ and not be revoked). " +
          `Generate a fresh one in the portal under your site -> Integrations: ${WEBSITE_URL}`
      );
    }
    throw new Error(payload.error.message || `Request failed with code ${code}.`);
  }

  const result = payload && payload.result;
  if (!result) {
    throw new Error(`Empty response from ${name}.`);
  }

  // 2. Tool-level error.
  if (result.isError === true) {
    const msg =
      (result.content && result.content[0] && result.content[0].text) ||
      `${name} reported an error.`;
    throw new Error(msg);
  }

  // 3. Data.
  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = result.content && result.content[0] && result.content[0].text;
  if (text === undefined) {
    throw new Error(`${name} returned no data.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Some read-only tools may return plain text (for example get_conventions).
    return { text };
  }
}

// ─── Unauthenticated connectivity check ──────────────────────────────────
async function connectivityCheck(base) {
  const url = `${base}/api/mcp`;
  let res;
  try {
    res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error(`Cannot reach ${url}: ${e.message}`);
  }
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* tolerate a non-JSON discovery body */
  }
  return { ok: res.ok, status: res.status, body };
}

// ─── Site resolution (customer key) ──────────────────────────────────────
/** Resolve a target site slug. Throws on ambiguity or none. */
async function resolveSite(base, key, explicit) {
  if (explicit) return explicit;
  const data = await mcpCall(base, key, "site_list", {});
  const sites = (data && data.sites) || [];
  if (sites.length === 1) {
    const s = sites[0];
    log.info(`Using your only site: ${c.bold}${s.slug}${c.reset}${s.name ? ` (${s.name})` : ""}`);
    return s.slug;
  }
  if (sites.length === 0) {
    throw new Error(
      "No sites found for this key. Create a site first in the portal, then try again.\n" +
        `  Sign up or open the portal at ${SIGNUP_URL}`
    );
  }
  const slugs = sites.map((s) => s.slug).join(", ");
  throw new Error(
    `You have ${sites.length} sites. Pass --site <slug> to choose one.\n  Sites: ${slugs}`
  );
}

// ─── Page upload ─────────────────────────────────────────────────────────
async function uploadOnePage(base, key, site, page, baseDir, opts = {}) {
  const filePath = resolve(baseDir, page.file);
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const html = readFileSync(filePath, "utf8");
  const { assets, missing } = buildAssets(html, baseDir);

  if (opts.check) {
    try {
      const pf = await mcpCall(base, key, "page_preflight", {
        pageSlug: page.slug,
        html,
      });
      const bits = [];
      if (typeof pf.ready === "boolean") bits.push(pf.ready ? "ready" : "needs attention");
      // The server returns `sections` as an object (total/distinct/...) and
      // `fidelity` as { ok, issues }, not as scalars.
      const secCount = pf.sections && (pf.sections.total ?? pf.sections.distinct);
      if (typeof secCount === "number") bits.push(`${secCount} section(s)`);
      if (pf.fidelity && typeof pf.fidelity === "object")
        bits.push(`fidelity ${pf.fidelity.ok ? "ok" : "issues"}`);
      log.dim(`  preflight: ${bits.length ? bits.join(", ") : "ok"}`);
      if (Array.isArray(pf.needsAttention) && pf.needsAttention.length) {
        for (const n of pf.needsAttention) log.warn(`  ${typeof n === "string" ? n : JSON.stringify(n)}`);
      }
      if (pf.guidance && typeof pf.guidance === "string") log.dim(`  ${pf.guidance}`);
    } catch (e) {
      log.warn(`  preflight skipped: ${e.message}`);
    }
  }

  const data = await mcpCall(base, key, "page_upload", {
    site,
    pageSlug: page.slug,
    pageLabel: page.label,
    pagePath: page.path,
    ...(page.sortOrder !== undefined && page.sortOrder !== null
      ? { sortOrder: page.sortOrder }
      : {}),
    html,
    ...(assets.length > 0 ? { assets } : {}),
  });

  // Some tools report a logical failure in the payload rather than isError.
  if (data && data.ok === false) {
    throw new Error(data.error || "Upload failed.");
  }

  return {
    fileSize: Buffer.byteLength(html, "utf8"),
    slotsAdded: data.slotsAdded ?? 0,
    slotsUpdated: data.slotsUpdated ?? 0,
    slotsRemapped: data.slotsRemapped ?? 0,
    duplicateKeys: data.duplicateKeys ?? [],
    assetsUploaded: assets.length,
    assetsMissing: missing,
    coverage: data.coverage,
    raw: data,
  };
}

function printUploadResult(slug, r) {
  const parts = [
    `${c.green}+${r.slotsAdded}${c.reset} new`,
    `${c.cyan}~${r.slotsUpdated}${c.reset} updated`,
  ];
  if (r.slotsRemapped > 0) parts.push(`${c.blue}${r.slotsRemapped}${c.reset} remapped`);
  if (r.assetsUploaded > 0) parts.push(`${c.blue}${r.assetsUploaded}${c.reset} image(s)`);
  if (r.duplicateKeys.length > 0)
    parts.push(`${c.yellow}${r.duplicateKeys.length}${c.reset} duplicate key(s)`);
  log.ok(
    `${c.bold}${slug}${c.reset} ${c.dim}(${(r.fileSize / 1024).toFixed(1)} KB)${c.reset} ${parts.join(", ")}`
  );
  if (r.assetsMissing.length > 0)
    log.warn(`  Referenced images not found locally (they will 404 live): ${r.assetsMissing.join(", ")}`);
}

// ─── publish + deploy status ─────────────────────────────────────────────
async function publishSite(base, key, site) {
  const data = await mcpCall(base, key, "site_publish", { site });
  if (data && data.ok === false) {
    throw new Error(data.error || data.deployError || "Publish failed.");
  }
  let liveUrl = data && data.deploy && data.deploy.liveUrl;
  if (!liveUrl) {
    try {
      const ds = await mcpCall(base, key, "deploy_status", { site });
      liveUrl = ds && ds.status && ds.status.live_url;
    } catch {
      /* best-effort fallback only */
    }
  }
  return { data, liveUrl };
}

// ─── Local lint (no key needed) ──────────────────────────────────────────
function localLint(html, baseDir) {
  const warnings = [];
  const notes = [];

  // Forms with an off-site action lose leads.
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) {
    const tag = m[0];
    const actionMatch = tag.match(/\baction\s*=\s*["']([^"']*)["']/i);
    if (actionMatch) {
      const action = actionMatch[1].trim();
      if (/^https?:\/\//i.test(action)) {
        warnings.push(
          `Form action points off-site (${action}). VibeBridge will not capture these leads. Use a relative or empty action.`
        );
      }
    }
  }

  // Relative image refs that do not exist on disk will 404 live.
  const { missing } = buildAssets(html, baseDir);
  for (const ref of missing) {
    warnings.push(`Referenced image not found, it will 404 on the live site: ${ref}`);
  }

  // Informational: text elements without data-cms-key.
  // The server auto-injects keys, so this is a gentle note, not noise.
  const hasAnyKey = /\bdata-cms-key\s*=/.test(html);
  if (!hasAnyKey) {
    notes.push(
      "No data-cms-key attributes found. The server will auto-generate keys, but semantic keys (for example hero.headline) survive re-uploads better."
    );
  }

  return { warnings, notes };
}

// ─── Config loading for deploy ───────────────────────────────────────────
function loadDeployConfig(explicitPath) {
  const path = explicitPath
    ? resolve(cwd(), explicitPath)
    : resolve(cwd(), "vibebridge.json");
  if (!existsSync(path)) {
    log.fail(
      `Config not found: ${path}\n  Run ${c.bold}vibebridge init${c.reset} to create one, or pass --config <path>.`
    );
    exit(EXIT.USAGE);
  }
  let cfg;
  try {
    cfg = readJsonFile(path);
  } catch (e) {
    log.fail(`Config is not valid JSON: ${path}\n  ${e.message}`);
    exit(EXIT.USAGE);
  }
  const errs = [];
  if (!Array.isArray(cfg.pages) || cfg.pages.length === 0)
    errs.push('"pages" (array with at least one entry) is required');
  else
    cfg.pages.forEach((p, i) => {
      if (!p.file) errs.push(`pages[${i}].file is missing`);
      if (!p.slug) errs.push(`pages[${i}].slug is missing`);
      if (!p.label) errs.push(`pages[${i}].label is missing`);
      if (!p.path) errs.push(`pages[${i}].path is missing`);
    });
  if (errs.length > 0) {
    log.fail(`Config schema errors in ${path}:`);
    for (const e of errs) console.error(`  - ${e}`);
    exit(EXIT.USAGE);
  }
  cfg._dir = dirname(path);
  cfg._name = basename(path);
  return cfg;
}

// ─── Command: help ───────────────────────────────────────────────────────
function cmdHelp() {
  const v = readVersion();
  log.plain(`${c.bold}VibeBridge CLI${c.reset} ${c.dim}v${v}${c.reset}`);
  log.plain("Get your AI website online and editable in minutes.");
  log.plain("");
  log.plain(`${c.bold}Usage${c.reset}`);
  log.plain("  vibebridge <command> [options]   (alias: vbb)");
  log.plain("");
  log.plain(`${c.bold}Commands${c.reset}`);
  log.plain("  whoami            Check your API key and list your accessible sites");
  log.plain("  init              Create a vibebridge.json from the HTML files in this folder");
  log.plain("  check [file]      Lint a page locally, and on the server when a key is set");
  log.plain("  deploy            Upload the pages in vibebridge.json and publish the site");
  log.plain("  publish           Alias of deploy");
  log.plain("  push <file>       Upload a single page");
  log.plain("");
  log.plain(`${c.bold}Common options${c.reset}`);
  log.plain("  --key <k>         API key (or set VIBEBRIDGE_API_KEY)");
  log.plain("  --endpoint <url>  Override the API endpoint (default https://app.vibebridge.ai)");
  log.plain("  --site <slug>     Target site slug");
  log.plain("  --dry-run         Show the plan and detected assets without calling the network");
  log.plain("  --check           Run a server preflight before each upload");
  log.plain("  --no-publish      Upload pages but do not publish (deploy only)");
  log.plain("  --config <path>   Use a specific vibebridge.json (deploy only)");
  log.plain("  -h, --help        Show this help");
  log.plain("  -v, --version     Show the version");
  log.plain("");
  log.plain(`${c.bold}push options${c.reset}`);
  log.plain("  --path </about>   Page path (default /)");
  log.plain("  --slug <s>        Page slug (default derived from filename)");
  log.plain("  --label <L>       Page label (default Title Case of slug)");
  log.plain("  --sort <n>        Sort order");
  log.plain("  --publish         Publish the site after uploading");
  log.plain("");
  log.dim(`New here? Sign up at ${SIGNUP_URL}`);
}

// ─── Command: version ────────────────────────────────────────────────────
let _version = null;
function readVersion() {
  if (_version) return _version;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = readJsonFile(resolve(here, "..", "package.json"));
    _version = pkg.version || "0.0.0";
  } catch {
    _version = "0.0.0";
  }
  return _version;
}

function cmdVersion() {
  log.plain(readVersion());
}

// ─── Command: whoami ─────────────────────────────────────────────────────
async function cmdWhoami(flags) {
  const key = requireKey(flags);
  const base = resolveEndpoint(flags);

  log.info(`Endpoint: ${c.bold}${base}${c.reset}`);
  try {
    const conn = await connectivityCheck(base);
    if (conn.ok && conn.body && conn.body.name) {
      log.ok(
        `Reached ${c.bold}${conn.body.name}${c.reset}${conn.body.version ? ` v${conn.body.version}` : ""} (${conn.body.toolCount ?? "?"} tools).`
      );
    } else {
      log.warn(`Connectivity check returned HTTP ${conn.status}.`);
    }
  } catch (e) {
    log.fail(e.message);
    exit(EXIT.AUTH);
  }

  // Identity: mcp_whoami, with site_list fallback.
  let principal = null;
  try {
    const who = await mcpCall(base, key, "mcp_whoami", {});
    principal = who.principal || who.name || who.email || who.role || null;
    if (who.principal || who.email || who.name) {
      log.ok(`Authenticated as ${c.bold}${principal || "your account"}${c.reset}.`);
    }
  } catch {
    /* mcp_whoami may be unavailable for some keys; fall back to site_list */
  }

  let sites = [];
  try {
    const data = await mcpCall(base, key, "site_list", {});
    sites = (data && data.sites) || [];
    if (!principal) log.ok("API key accepted.");
  } catch (e) {
    log.fail(e.message);
    exit(EXIT.AUTH);
  }

  if (sites.length === 0) {
    log.warn("No sites yet. Create one in the portal, then run vibebridge deploy.");
    log.dim(`  ${SIGNUP_URL}`);
    return EXIT.OK;
  }

  log.plain("");
  log.plain(`${c.bold}Your sites${c.reset} (${sites.length})`);
  const rows = sites.map((s) => [
    s.slug || "",
    s.name || "",
    s.status || "",
    s.live_url || "",
  ]);
  const headers = ["SLUG", "NAME", "STATUS", "LIVE URL"];
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i]).length))
  );
  const fmt = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join("  ");
  log.dim(`  ${fmt(headers)}`);
  for (const r of rows) log.plain(`  ${fmt(r)}`);
  return EXIT.OK;
}

// ─── Command: init ───────────────────────────────────────────────────────
function cmdInit(flags) {
  const target = resolve(cwd(), "vibebridge.json");
  if (existsSync(target)) {
    log.fail(
      "vibebridge.json already exists here. Delete it first if you want to recreate it."
    );
    exit(EXIT.USAGE);
  }

  // Auto-detect *.html files in cwd (non-recursive).
  let htmlFiles = [];
  try {
    htmlFiles = readdirSync(cwd())
      .filter((f) => /\.html?$/i.test(f))
      .sort();
  } catch {
    htmlFiles = [];
  }

  const pages = htmlFiles.map((file, idx) => {
    const isIndex = /^index\.html?$/i.test(file);
    const slug = isIndex ? "home" : slugFromFile(file);
    const path = isIndex ? "/" : `/${slug}`;
    const label = isIndex ? "Home" : titleCase(slug);
    return { file, slug, label, path, sortOrder: idx * 10 };
  });

  const cfg = {
    site: flags.site || "your-site-slug",
    endpoint: DEFAULT_ENDPOINT,
    pages:
      pages.length > 0
        ? pages
        : [{ file: "index.html", slug: "home", label: "Home", path: "/", sortOrder: 0 }],
  };

  writeFileSync(target, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  log.ok(`Created ${c.bold}vibebridge.json${c.reset}`);
  if (pages.length > 0) {
    log.info(`Detected ${pages.length} HTML file(s):`);
    for (const p of pages) log.plain(`  ${p.slug.padEnd(14)} <- ${p.file}  (${p.path})`);
  } else {
    log.warn("No HTML files found here. A template page was added. Edit vibebridge.json.");
  }
  log.plain("");
  log.plain(`${c.bold}Next steps${c.reset}`);
  log.plain('  1. Set your site slug in vibebridge.json (the "site" field).');
  log.plain("  2. Generate an API key in the portal under your site -> Integrations.");
  log.plain('     export VIBEBRIDGE_API_KEY="vbb_live_..."');
  log.plain("  3. Run vibebridge deploy");
  log.dim(`  New here? Sign up at ${SIGNUP_URL}`);
  return EXIT.OK;
}

// ─── Command: check ──────────────────────────────────────────────────────
async function cmdCheck(flags) {
  // Resolve the file: positional, else single page from vibebridge.json, else index.html.
  let file = flags._[0];
  let baseDir = cwd();
  if (!file) {
    const cfgPath = resolve(cwd(), "vibebridge.json");
    if (existsSync(cfgPath)) {
      try {
        const cfg = readJsonFile(cfgPath);
        if (Array.isArray(cfg.pages) && cfg.pages.length === 1) {
          file = cfg.pages[0].file;
          baseDir = dirname(cfgPath);
        }
      } catch {
        /* fall through to default */
      }
    }
  }
  if (!file) file = "index.html";

  const filePath = resolve(baseDir, file);
  if (!existsSync(filePath)) {
    log.fail(`File not found: ${filePath}`);
    exit(EXIT.PUBLISH); // 3: file missing/unreadable
  }
  let html;
  try {
    html = readFileSync(filePath, "utf8");
  } catch (e) {
    log.fail(`Could not read ${filePath}: ${e.message}`);
    exit(EXIT.PUBLISH);
  }

  log.info(`Checking ${c.bold}${file}${c.reset}`);

  const { warnings, notes } = localLint(html, dirname(filePath));
  for (const w of warnings) log.warn(w);
  for (const n of notes) log.dim(`  ${n}`);
  if (warnings.length === 0) log.ok("No local issues found.");

  // Server-side validation when a key is available (do not require one).
  let serverErrorCount = 0;
  const key = resolveKey(flags);
  if (key) {
    const base = resolveEndpoint(flags);
    try {
      const slug = slugFromFile(file);
      const v = await mcpCall(base, key, "validate_html", { html, pageSlug: slug });
      const val = (v && v.validation) || {};
      const sErrors = val.errors || [];
      const sWarnings = val.warnings || [];
      serverErrorCount = sErrors.length;
      if (typeof val.slots === "number") log.info(`Server sees ${val.slots} editable slot(s).`);
      for (const e of sErrors) log.fail(`server: ${typeof e === "string" ? e : JSON.stringify(e)}`);
      for (const w of sWarnings) log.warn(`server: ${typeof w === "string" ? w : JSON.stringify(w)}`);
      if (sErrors.length === 0 && sWarnings.length === 0) log.ok("Server validation passed.");
    } catch (e) {
      log.warn(`Server validation skipped: ${e.message}`);
    }
  } else {
    log.dim("  Tip: set VIBEBRIDGE_API_KEY to also run server-side validation.");
  }

  // Local warnings alone keep exit 0 so check stays friendly in scripts. Only
  // blocking server errors (for example a form that would lose leads) fail.
  if (serverErrorCount > 0) return EXIT.PUBLISH;
  return EXIT.OK;
}

// ─── Command: deploy / publish ───────────────────────────────────────────
async function cmdDeploy(flags) {
  const cfg = loadDeployConfig(flags.config);
  const base = resolveEndpoint(flags, cfg.endpoint);

  let pages = cfg.pages;
  if (flags.page) {
    pages = cfg.pages.filter((p) => p.slug === flags.page);
    if (pages.length === 0) {
      log.fail(`Page "${flags.page}" is not in the config.`);
      exit(EXIT.USAGE);
    }
  }

  log.info(`Config: ${c.bold}${cfg._name}${c.reset} ${c.dim}(${cfg._dir})${c.reset}`);
  log.info(`Endpoint: ${c.bold}${base}${c.reset}`);

  // Dry run: show plan + assets, no network, no key needed.
  if (flags.dryRun) {
    log.warn("Dry run. No network calls, showing the plan only.");
    for (const p of pages) {
      const fp = resolve(cfg._dir, p.file);
      const exists = existsSync(fp);
      log.plain(`  ${exists ? c.green + "✓" + c.reset : c.red + "✗" + c.reset} ${String(p.slug).padEnd(14)} <- ${p.file}  (${p.path})${exists ? "" : " (MISSING)"}`);
      if (exists) {
        const { assets, missing } = buildAssets(readFileSync(fp, "utf8"), cfg._dir);
        if (assets.length > 0)
          log.plain(`      ${c.blue}${assets.length} image(s)${c.reset}: ${assets.map((a) => a.path).join(", ")}`);
        if (missing.length > 0)
          log.plain(`      ${c.yellow}missing images${c.reset}: ${missing.join(", ")}`);
      }
    }
    log.plain("");
    log.info(`Would ${flags.noPublish ? "upload only (no publish)" : "upload and publish"}.`);
    return EXIT.OK;
  }

  const key = requireKey(flags);

  // Connectivity (best-effort, does not need the key).
  try {
    const conn = await connectivityCheck(base);
    if (!conn.ok) log.warn(`Connectivity check returned HTTP ${conn.status}.`);
  } catch (e) {
    log.fail(e.message);
    exit(EXIT.AUTH);
  }

  // Resolve the target site.
  let site;
  try {
    site = await resolveSite(base, key, flags.site || cfg.site);
    // Guard: the init placeholder slug is not a real site.
    if (site === "your-site-slug") {
      throw new Error(
        'Set your site slug in vibebridge.json (the "site" field still says "your-site-slug"), or pass --site <slug>.'
      );
    }
  } catch (e) {
    log.fail(e.message);
    exit(e.message && e.message.startsWith("Cannot reach") ? EXIT.AUTH : EXIT.PUBLISH);
  }
  log.info(`Site: ${c.bold}${site}${c.reset}`);

  let failed = 0;
  for (const page of pages) {
    try {
      const r = await uploadOnePage(base, key, site, page, cfg._dir, { check: flags.check });
      printUploadResult(page.slug, r);
    } catch (e) {
      log.fail(`${c.bold}${page.slug}${c.reset}: ${e.message}`);
      if (/Unauthorized/i.test(e.message)) exit(EXIT.AUTH);
      failed++;
    }
  }

  if (failed > 0) {
    log.fail(`${pages.length - failed} of ${pages.length} page(s) uploaded, ${failed} failed.`);
    exit(EXIT.PUBLISH);
  }

  if (flags.noPublish) {
    log.plain("");
    log.ok(`Uploaded ${pages.length} page(s) as a draft. Skipped publish (--no-publish).`);
    log.dim(`  Publish later with: vibebridge deploy`);
    return EXIT.OK;
  }

  // Publish.
  log.info("Publishing...");
  try {
    const { data, liveUrl } = await publishSite(base, key, site);
    log.plain("");
    log.ok(`Published ${pages.length} page(s).`);
    if (data && data.deployError)
      log.warn(`Content promoted, but the deploy reported: ${data.deployError}`);
    if (liveUrl) log.plain(`  ${c.bold}Live:${c.reset} ${liveUrl}`);
    else log.dim("  Live URL not returned yet. Check deploy status in the portal.");
  } catch (e) {
    log.fail(`Publish failed: ${e.message}`);
    if (/Unauthorized/i.test(e.message)) exit(EXIT.AUTH);
    exit(EXIT.PUBLISH);
  }
  return EXIT.OK;
}

// ─── Command: push ───────────────────────────────────────────────────────
async function cmdPush(flags) {
  const file = flags._[0];
  if (!file) {
    log.fail("push needs a file. Example: vibebridge push about.html --path /about");
    exit(EXIT.USAGE);
  }
  const filePath = resolve(cwd(), file);
  if (!existsSync(filePath)) {
    log.fail(`File not found: ${filePath}`);
    exit(EXIT.USAGE);
  }
  const baseDir = dirname(filePath);

  const slug = flags.slug || slugFromFile(file);
  const label = flags.label || titleCase(slug);
  const path = flags.path || "/";
  let sortOrder;
  if (flags.sort !== undefined) {
    sortOrder = Number(flags.sort);
    if (!Number.isFinite(sortOrder)) {
      log.fail("--sort must be a number.");
      exit(EXIT.USAGE);
    }
  }
  const page = {
    file: basename(file),
    slug,
    label,
    path,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
  };

  const base = resolveEndpoint(flags);

  if (flags.dryRun) {
    log.warn("Dry run. No network calls, showing the plan only.");
    log.plain(`  ${c.bold}${page.slug}${c.reset} <- ${page.file}  (label "${page.label}", path "${page.path}")`);
    const { assets, missing } = buildAssets(readFileSync(filePath, "utf8"), baseDir);
    if (assets.length > 0)
      log.plain(`  ${c.blue}${assets.length} image(s)${c.reset}: ${assets.map((a) => a.path).join(", ")}`);
    if (missing.length > 0)
      log.plain(`  ${c.yellow}missing images${c.reset}: ${missing.join(", ")}`);
    log.info(`Would upload to endpoint ${base} and ${flags.publish ? "publish" : "leave as a draft"}.`);
    return EXIT.OK;
  }

  const key = requireKey(flags);

  let site;
  try {
    site = await resolveSite(base, key, flags.site);
  } catch (e) {
    log.fail(e.message);
    exit(e.message && e.message.startsWith("Cannot reach") ? EXIT.AUTH : EXIT.PUBLISH);
  }
  log.info(`Site: ${c.bold}${site}${c.reset}`);

  try {
    const r = await uploadOnePage(base, key, site, page, baseDir, { check: flags.check });
    printUploadResult(page.slug, r);
  } catch (e) {
    log.fail(`${page.slug}: ${e.message}`);
    if (/Unauthorized/i.test(e.message)) exit(EXIT.AUTH);
    exit(EXIT.PUBLISH);
  }

  if (flags.publish) {
    log.info("Publishing...");
    try {
      const { data, liveUrl } = await publishSite(base, key, site);
      log.ok("Published.");
      if (data && data.deployError)
        log.warn(`Content promoted, but the deploy reported: ${data.deployError}`);
      if (liveUrl) log.plain(`  ${c.bold}Live:${c.reset} ${liveUrl}`);
    } catch (e) {
      log.fail(`Publish failed: ${e.message}`);
      if (/Unauthorized/i.test(e.message)) exit(EXIT.AUTH);
      exit(EXIT.PUBLISH);
    }
  } else {
    log.dim("  Draft uploaded. Add --publish to go live, or run vibebridge deploy.");
  }
  return EXIT.OK;
}

// ─── Entry point ─────────────────────────────────────────────────────────
async function main() {
  let flags;
  try {
    flags = parseArgs(argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      log.fail(e.message);
      log.dim("  Run vibebridge --help for usage.");
      exit(EXIT.USAGE);
    }
    throw e;
  }

  // Global flags take priority over a command.
  if (flags.version) return cmdVersion(), EXIT.OK;

  const cmd = flags._.shift();

  if (!cmd || flags.help) {
    cmdHelp();
    return EXIT.OK;
  }

  switch (cmd) {
    case "whoami":
      return cmdWhoami(flags);
    case "init":
      return cmdInit(flags);
    case "check":
      return cmdCheck(flags);
    case "deploy":
    case "publish":
      return cmdDeploy(flags);
    case "push":
      return cmdPush(flags);
    case "help":
      cmdHelp();
      return EXIT.OK;
    case "version":
      cmdVersion();
      return EXIT.OK;
    default:
      log.fail(`Unknown command: ${cmd}`);
      log.dim("  Run vibebridge --help for usage.");
      exit(EXIT.USAGE);
  }
}

main()
  .then((code) => {
    if (typeof code === "number" && code !== 0) exit(code);
  })
  .catch((e) => {
    log.fail(`Unexpected error: ${e && (e.stack || e.message) ? e.stack || e.message : e}`);
    exit(EXIT.UNEXPECTED);
  });
