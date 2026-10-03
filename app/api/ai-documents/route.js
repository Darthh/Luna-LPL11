import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { researchAccess, researchResponse } from "@/lib/researchApi.mjs";
import { objectKey, readJson, listJobs, startJob } from "@/lib/agentResearch.mjs";

export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_SIZE = 4 * 1024 * 1024;
const TYPES = { pdf: "application/pdf", txt: "text/plain", md: "text/markdown", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", mp3: "audio/mpeg", wav: "audio/wav" };
export async function GET(request) {
  const access = await researchAccess(request);
  if (access.error) return access.error;
  const url = new URL(request.url);
  try {
    if (!url.searchParams.has("id")) return researchResponse(access, { jobs: await listJobs(access.owner), agentAvailable: Boolean(process.env.AGENTCORE_RUNTIME_ARN) });
    const job = await readJson(objectKey(access.owner, url.searchParams.get("id")));
    if (!url.searchParams.has("download")) return researchResponse(access, { job });
    if (job.kind !== "document") return researchResponse(access, { error: "Not a document." }, 400);
    const object = await new S3Client({ region: process.env.BEDROCK_REGION || "us-east-1" }).send(new GetObjectCommand({ Bucket: process.env.RESEARCH_BUCKET, Key: objectKey(access.owner, job.id, `input.${job.extension}`) }));
    return new Response(await object.Body.transformToByteArray(), { headers: { "Content-Type": job.contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(job.title)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return researchResponse(access, { error: "Document or job not found." }, 404); }
}
export async function POST(request) {
  const access = await researchAccess(request, true);
  if (access.error) return access.error;
  if (Number(request.headers.get("content-length")) > MAX_SIZE + 65536) return researchResponse(access, { error: "Maximum upload size is 4 MB." }, 413);
  try {
    const form = await request.formData();
    const file = form.get("file");
    const extension = file?.name?.split(".").at(-1)?.toLowerCase();
    if (!file?.arrayBuffer || !TYPES[extension] || !file.size || file.size > MAX_SIZE) return researchResponse(access, { error: "Upload a PDF, text, Markdown, PNG, JPEG, MP3, or WAV file up to 4 MB." }, 400);
    const data = Buffer.from(await file.arrayBuffer());
    if (extension === "pdf" && !data.subarray(0, 5).equals(Buffer.from("%PDF-"))) return researchResponse(access, { error: "Invalid PDF." }, 400);
    const job = { id: randomUUID(), owner: access.owner, kind: "document", status: "queued", title: file.name.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 160), extension, contentType: TYPES[extension], createdAt: new Date().toISOString() };
    await new S3Client({ region: process.env.BEDROCK_REGION || "us-east-1" }).send(new PutObjectCommand({ Bucket: process.env.RESEARCH_BUCKET, Key: objectKey(access.owner, job.id, `input.${extension}`), Body: data, ContentType: job.contentType }));
    await startJob(job);
    return researchResponse(access, { job }, 202);
  } catch (error) {
    console.error("Document upload failed:", error.name);
    return researchResponse(access, { error: "Document upload could not be started." }, 502);
  }
}
