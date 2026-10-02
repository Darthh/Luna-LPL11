// The WebMCP tools are registered by a client component on page load, so the
// only honest check is a real browser with navigator.modelContext present.
// Chrome ships it behind an origin trial, so this installs a recorder before
// any page script runs and asserts on what the page registers.
//
// Run against a running server:  node scripts/test-webmcp.mjs [base-url]
import assert from "node:assert/strict";

// Playwright is not a dependency of this project - it is only ever present when
// someone has it installed globally or via npx. Skip rather than fail so this
// stays runnable in a bare checkout.
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("webmcp: skipped (playwright not installed - npx playwright install chromium)");
  process.exit(0);
}

const base = process.argv[2] ?? "https://lunaterminal.com";
const browser = await chromium.launch();
const page = await browser.newPage();

await page.addInitScript(() => {
  window.__mcpCalls = [];
  Object.defineProperty(navigator, "modelContext", {
    configurable: true,
    value: {
      registerTool(tool, options) {
        window.__mcpCalls.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          hasExecute: typeof tool.execute === "function",
          signalWired: Boolean(options?.signal),
        });
        return Promise.resolve();
      },
    },
  });
});

await page.goto(base, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__mcpCalls?.length > 0, null, { timeout: 20000 });
const calls = await page.evaluate(() => window.__mcpCalls);
await browser.close();

assert.ok(calls.length >= 3, `expected several tools, got ${calls.length}`);
for (const tool of calls) {
  assert.match(tool.name, /^[a-z0-9_]+$/, `tool name should be a stable identifier: ${tool.name}`);
  assert.ok(tool.description?.length > 20, `${tool.name} needs a description an agent can act on`);
  assert.equal(tool.inputSchema?.type, "object", `${tool.name} inputSchema must be a JSON Schema object`);
  assert.ok(tool.hasExecute, `${tool.name} needs an execute callback`);
  assert.ok(tool.signalWired, `${tool.name} must pass an AbortSignal so it can be unregistered`);
}

console.log(`webmcp: ok - ${calls.length} tools (${calls.map((c) => c.name).join(", ")})`);
