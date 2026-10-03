import { createServer } from "node:http";
import { runFinancialAgent } from "../../lib/financialAgent.mjs";

export function agentServer(run = runFinancialAgent) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/ping") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "Healthy" }));
      return;
    }
    if (request.method !== "POST" || request.url !== "/invocations") { response.writeHead(404); response.end(); return; }
    let body = "";
    try {
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 250000) { response.writeHead(413); response.end(); return; }
      }
      const input = JSON.parse(body);
      response.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" });
      await run(input, (t, v) => response.write(JSON.stringify({ t, v }) + "\n"));
    } catch (error) {
      console.error("Agent invocation failed:", error.name);
      if (!response.headersSent) response.writeHead(400, { "Content-Type": "application/x-ndjson" });
      response.write(JSON.stringify({ t: "error", v: "The research agent could not complete this request. Check model access and document status." }) + "\n");
    } finally { response.end(); }
  });
}
