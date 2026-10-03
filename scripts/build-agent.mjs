import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
await mkdir(".sst/agentcore", { recursive: true });
await build({ entryPoints: ["services/agentcore/entry.mjs"], bundle: true, platform: "node", target: "node22", format: "cjs", outfile: ".sst/agentcore/app.js", logLevel: "info" });
