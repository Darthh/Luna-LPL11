// One entry point for every offline check: `npm test`.
//
// Two kinds of test live in this repo - `node --test` suites next to the code
// (lib/*.test.mjs) and self-checking scripts (scripts/test-*.mjs) that throw
// on failure. This runs both and exits non-zero if anything failed.
//
// A few scripts hit live services on purpose (the bugs they guard against are
// invisible offline). They are skipped unless LUNA_NETWORK_TESTS=1, so CI and
// a laptop on a plane get a clean signal instead of an upstream outage.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const NETWORK = new Set([
  "test-markdown-negotiation.mjs", // needs a running server (defaults to production)
  "test-yahoo-quote.mjs", // Yahoo throttles or blocks unattended requests
]);
const withNetwork = process.env.LUNA_NETWORK_TESTS === "1";

const run = (args) => spawnSync(process.execPath, args, { stdio: "inherit" }).status === 0;

const units = readdirSync("lib").filter((f) => f.endsWith(".test.mjs")).map((f) => `lib/${f}`);
const failed = [];
if (!run(["--test", ...units])) failed.push("lib/*.test.mjs");

for (const file of readdirSync("scripts").filter((f) => /^test-.*\.mjs$/.test(f)).sort()) {
  if (NETWORK.has(file) && !withNetwork) {
    console.log(`skip  scripts/${file} (network; set LUNA_NETWORK_TESTS=1)`);
    continue;
  }
  const ok = run(["--experimental-strip-types", "--no-warnings", `scripts/${file}`]);
  console.log(`${ok ? "ok   " : "FAIL "} scripts/${file}`);
  if (!ok) failed.push(`scripts/${file}`);
}

if (failed.length) {
  console.error(`\n${failed.length} failed:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}
console.log("\nall tests passed");
