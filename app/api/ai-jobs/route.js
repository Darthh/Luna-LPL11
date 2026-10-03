import { randomUUID } from "node:crypto";
import { researchAccess, researchResponse } from "@/lib/researchApi.mjs";
import { startJob } from "@/lib/agentResearch.mjs";
import { hostedModel } from "@/lib/hostedModels.mjs";

export const runtime = "nodejs";
export async function POST(request) {
  const access = await researchAccess(request, true);
  if (access.error) return access.error;
  try {
    const body = await request.json();
    const model = hostedModel(body.model);
    if (typeof body.query !== "string" || !body.query.trim() || body.query.length > 8000 || !model || !["bedrock", "mantle"].includes(model.provider)) return researchResponse(access, { error: "Enter a research question and select an AWS model." }, 400);
    if (!process.env.AGENTCORE_RUNTIME_ARN) return researchResponse(access, { error: "AgentCore has not been deployed." }, 503);
    const job = { id: randomUUID(), owner: access.owner, kind: "report", status: "queued", title: body.query.trim().slice(0, 160), query: body.query.trim(), model: body.model, createdAt: new Date().toISOString() };
    await startJob(job);
    return researchResponse(access, { job }, 202);
  } catch (error) {
    console.error("Research job failed:", error.name);
    return researchResponse(access, { error: "Research could not be started." }, 502);
  }
}
