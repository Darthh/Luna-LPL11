import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { unstable_doesMiddlewareMatch } = require("next/experimental/testing/server");
// Read the actual statically analyzed config without initializing Auth.js.
const source = readFileSync(new URL("../proxy.js", import.meta.url), "utf8");
const config = runInNewContext(`(${source.split("export const config = ")[1].trim().replace(/;$/, "")})`);
const matches = (url) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

for (const path of ["/api/auth", "/api/auth/signout", "/api/auth/session", "/api/auth/csrf", "/api/auth/callback/google", "/api/auth/register"]) {
  assert.equal(matches(path), false, `${path} must not refresh cookies through proxy`);
}
for (const path of ["/dashboard", "/dashboard/chat", "/api/chats", "/api/profile", "/api/chat-memory", "/api/authors", "/trpc/research"]) {
  assert.equal(matches(path), true, `${path} must retain session middleware`);
}
for (const path of ["/_next/static/chunks/app.js", "/robots.txt", "/sitemap.xml"]) {
  assert.equal(matches(path), false, `${path} must remain excluded`);
}
console.log("auth proxy: auth endpoints excluded; account routes retain session middleware");
