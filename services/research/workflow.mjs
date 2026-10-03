import { withDurableExecution } from "@aws/durable-execution-sdk-js";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { BedrockDataAutomationRuntimeClient, InvokeDataAutomationAsyncCommand, GetDataAutomationStatusCommand } from "@aws-sdk/client-bedrock-data-automation-runtime";
import { objectKey, writeJson, documentChunks, indexChunk, archiveSql, startHistoryQuery, historyQueryStatus } from "../../lib/agentResearch.mjs";
import { invokeAgent } from "../../lib/agentCoreClient.mjs";

const config = () => ({ region: process.env.BEDROCK_REGION || "us-east-1" });
export function extractedText(value) {
  if (typeof value?.document?.representation?.markdown === "string") return value.document.representation.markdown;
  if (typeof value?.document?.representation?.text === "string") return value.document.representation.text;
  const pages = value?.pages || value?.document?.pages;
  if (Array.isArray(pages)) return pages.map(page => page.representation?.markdown || page.representation?.text || page.text || "").join("\n\n");
  if (Array.isArray(value?.segments)) return value.segments.map(s => s.text || s.transcript || "").join("\n");
  if (typeof value?.text === "string") return value.text;
  if (Array.isArray(value?.audio_segments)) return value.audio_segments.filter(s => s.type === "TRANSCRIPT").map(s => s.text || "").join("\n");
  if (Array.isArray(value?.image?.text_lines)) return value.image.text_lines.map(s => s.text || "").join("\n");
  if (Array.isArray(value?.text_lines)) return value.text_lines.map(s => s.text || "").join("\n");
  return "";
}
async function textOutput(job) {
  const prefix = objectKey(job.owner, job.id, "output/");
  const client = new S3Client(config());
  const listed = await client.send(new ListObjectsV2Command({ Bucket: process.env.RESEARCH_BUCKET, Prefix: prefix, MaxKeys: 200 }));
  const candidates = (listed.Contents || []).filter(o => /standard_output.*\.json$/.test(o.Key) || /\.md$/.test(o.Key));
  const texts = [];
  for (const item of candidates) {
    if (item.Size > 5 * 1024 * 1024) throw new Error("Extracted output exceeds the processing limit.");
    const object = await client.send(new GetObjectCommand({ Bucket: process.env.RESEARCH_BUCKET, Key: item.Key }));
    const body = await object.Body.transformToString();
    texts.push(item.Key.endsWith(".md") ? body : extractedText(JSON.parse(body)));
  }
  const text = texts.filter(Boolean).join("\n\n");
  if (!text) throw new Error("Data Automation returned no supported text output.");
  documentChunks(text);
  return text;
}
export async function researchWorkflow(job, context) {
  objectKey(job.owner, job.id);
  try {
    await context.step("processing", () => writeJson(objectKey(job.owner, job.id), { ...job, status: "processing" }));
    let summary = "";
    let sources = [];
    let chunks;
    if (job.kind === "document") {
      let text;
      if (["txt", "md"].includes(job.extension)) {
        text = await context.step("read-text", async () => {
          const result = await new S3Client(config()).send(new GetObjectCommand({ Bucket: process.env.RESEARCH_BUCKET, Key: objectKey(job.owner, job.id, `input.${job.extension}`) }));
          const text = await result.Body.transformToString();
          documentChunks(text);
          return text;
        });
      } else {
        const client = new BedrockDataAutomationRuntimeClient(config());
        const invocation = await context.step("extract", async () => {
          const result = await client.send(new InvokeDataAutomationAsyncCommand({ clientToken: job.id,
            inputConfiguration: { s3Uri: `s3://${process.env.RESEARCH_BUCKET}/${objectKey(job.owner, job.id, `input.${job.extension}`)}` },
            outputConfiguration: { s3Uri: `s3://${process.env.RESEARCH_BUCKET}/${objectKey(job.owner, job.id, "output/")}` },
            dataAutomationConfiguration: { dataAutomationProjectArn: process.env.BDA_PROJECT_ARN, stage: "LIVE" },
            dataAutomationProfileArn: process.env.BDA_PROFILE_ARN }));
          return result.invocationArn;
        });
        let completed = false;
        for (let i = 0; i < 120; i++) {
          const status = await context.step(`extraction-status-${i}`, () => client.send(new GetDataAutomationStatusCommand({ invocationArn: invocation })).then(r => r.status));
          if (status === "Success") { completed = true; break; }
          if (["ClientError", "ServiceError"].includes(status)) throw new Error("Document extraction failed.");
          await context.wait(`extraction-wait-${i}`, { seconds: 15 });
        }
        if (!completed) throw new Error("Document extraction timed out.");
        text = await context.step("read-extraction", () => textOutput(job));
      }
      const parts = documentChunks(text);
      for (let i = 0; i < parts.length; i++) {
        await context.step(`index-chunk-${i}`, () => indexChunk(job, parts[i], i));
        if (i > 0 && i % 15 === 0) await context.wait(`index-pause-${i}`, { seconds: 1 });
      }
      chunks = parts.length;
      summary = text.slice(0, 2000);
    } else if (job.kind === "report") {
      const report = await context.step("agent-research", async () => {
        let answer = "";
        const evidence = [];
        await invokeAgent({ owner: job.owner, model: job.model, messages: [{ role: "user", content: job.query }], documentIds: [] }, `${job.owner}${job.id.replaceAll("-", "")}`, event => {
          if (event.t === "text") answer += event.v;
          if (event.t === "data") evidence.push(event.v);
          if (event.t === "error") throw new Error("Research agent failed.");
        });
        if (!answer.trim()) throw new Error("Research report was empty.");
        return { answer, evidence };
      });
      summary = report.answer;
      sources = report.evidence;
    } else throw new Error("Unsupported job type.");
    const final = { ...job, status: "ready", summary, sources, ...(chunks ? { chunks } : {}) };
    const queryId = await context.step("archive-history", () => startHistoryQuery(archiveSql(final), `${job.owner}${job.id.replaceAll("-", "")}`));
    let archived = false;
    for (let i = 0; i < 60; i++) {
      const state = await context.step(`archive-status-${i}`, () => historyQueryStatus(queryId));
      if (state === "SUCCEEDED") { archived = true; break; }
      if (["FAILED", "CANCELLED"].includes(state)) throw new Error("Research archive failed.");
      await context.wait(`archive-wait-${i}`, { seconds: 5 });
    }
    if (!archived) throw new Error("Research archive timed out.");
    await context.step("ready", () => writeJson(objectKey(job.owner, job.id), { ...final, completedAt: new Date().toISOString() }));
    return { id: job.id, status: "ready" };
  } catch (error) {
    await context.step("failed", () => writeJson(objectKey(job.owner, job.id), { ...job, status: "failed", error: "Processing failed. Check extraction, embedding, model access, and archive permissions." }));
    console.error("Research processing failed:", error.name);
    return { id: job.id, status: "failed" };
  }
}
export const handler = withDurableExecution(researchWorkflow);
