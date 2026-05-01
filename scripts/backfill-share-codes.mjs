#!/usr/bin/env node
/**
 * Backfill share_code for existing submitted responses.
 *
 * Safe defaults:
 *   - dry-run unless --apply is passed
 *   - local D1 unless --remote is passed
 *   - remote apply requires CONFIRM_REMOTE_SHARE_CODE_BACKFILL=mayliveforever
 *
 * Examples:
 *   node scripts/backfill-share-codes.mjs --local
 *   node scripts/backfill-share-codes.mjs --remote
 *   CONFIRM_REMOTE_SHARE_CODE_BACKFILL=mayliveforever node scripts/backfill-share-codes.mjs --remote --apply
 */
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const DB_NAME = "red-vs-blue";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const args = new Set(process.argv.slice(2));
const isRemote = args.has("--remote");
const apply = args.has("--apply");
const scope = isRemote ? "--remote" : "--local";

if (args.has("--help") || args.has("-h")) {
  console.log("Usage: node scripts/backfill-share-codes.mjs [--local|--remote] [--apply]");
  process.exit(0);
}

if (args.has("--local") && args.has("--remote")) {
  fail("Choose exactly one database scope: --local or --remote.");
}

if (isRemote && apply && process.env.CONFIRM_REMOTE_SHARE_CODE_BACKFILL !== "mayliveforever") {
  fail("Remote apply requires CONFIRM_REMOTE_SHARE_CODE_BACKFILL=mayliveforever.");
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function generateShareCode() {
  const bytes = randomBytes(5);
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < 8; i++) {
    out = ALPHABET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

function wrangler(args) {
  return execFileSync("npx", ["wrangler", "d1", "execute", DB_NAME, scope, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function query(command) {
  const raw = wrangler(["--command", command, "--json"]);
  const parsed = JSON.parse(raw);
  return extractRows(parsed);
}

function extractRows(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const rows = extractRows(item);
      if (rows.length) return rows;
    }
    return [];
  }
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.result)) return value.result;
  if (value.result && typeof value.result === "object") return extractRows(value.result);
  return [];
}

const existingRows = query(
  "SELECT share_code FROM responses WHERE share_code IS NOT NULL ORDER BY share_code",
);
const usedCodes = new Set(existingRows.map((r) => r.share_code).filter(Boolean));
const rows = query(
  `SELECT token_id
     FROM responses
    WHERE submitted_at IS NOT NULL
      AND share_code IS NULL
    ORDER BY submitted_at, token_id`,
);

const assignments = rows.map((row) => {
  let code;
  do {
    code = generateShareCode();
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return { tokenId: row.token_id, code };
});

console.log(`${apply ? "Applying" : "Dry-run"} share_code backfill against ${isRemote ? "remote" : "local"} D1.`);
console.log(`Existing share codes: ${existingRows.length}`);
console.log(`Rows needing share_code: ${assignments.length}`);

if (assignments.length === 0) process.exit(0);

console.log("First assignments:");
for (const a of assignments.slice(0, 5)) {
  console.log(`  ${a.tokenId} -> ${a.code}`);
}

if (!apply) {
  console.log("No writes performed. Re-run with --apply to write these updates.");
  process.exit(0);
}

const sql = [
  ...assignments.map(
    ({ tokenId, code }) =>
      `UPDATE responses SET share_code = ${sqlQuote(code)}, updated_at = datetime('now') WHERE token_id = ${sqlQuote(tokenId)} AND submitted_at IS NOT NULL AND share_code IS NULL;`,
  ),
  "",
].join("\n");

// Use --command instead of --file here: --file goes through D1's import API,
// which can fail under OAuth-scope drift even when normal D1 execute works.
wrangler(["--command", sql]);

const missing = query(
  "SELECT COUNT(*) AS count FROM responses WHERE submitted_at IS NOT NULL AND share_code IS NULL",
)[0]?.count;
const duplicates = query(
  `SELECT COUNT(*) AS count
     FROM (
       SELECT share_code
         FROM responses
        WHERE share_code IS NOT NULL
        GROUP BY share_code
       HAVING COUNT(*) > 1
     )`,
)[0]?.count;

console.log(`Missing submitted share codes after backfill: ${missing}`);
console.log(`Duplicate share codes after backfill: ${duplicates}`);

if (Number(missing) !== 0 || Number(duplicates) !== 0) {
  fail("Backfill verification failed; inspect the database before deploying code.");
}
