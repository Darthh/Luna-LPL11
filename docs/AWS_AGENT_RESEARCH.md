# Chat agent and research services

The AWS chat choices run the financial tool harness inside Bedrock AgentCore
Runtime when `AGENTCORE_RUNTIME_ARN` is configured. The Next.js route authenticates
the caller, applies the existing chat limit, validates attachment ownership,
and forwards the agent's text, evidence, and error events. Direct Anthropic,
Google, and browser-local model paths remain available. AgentCore failures are
reported; they do not silently switch to another model.

## Services and user flow

- **AgentCore:** a Node 22 runtime with `/ping` and `/invocations`, IAM-only inbound
  access, scoped model permissions, per-owner/per-conversation runtime sessions,
  and streamed NDJSON answers. The harness forces a tool planning turn and caps
  execution at four tools. Existing quotes, price history, sentiment, and site
  navigation tools run inside the runtime. Document and research-history tools
  share the same harness. There is no persistent AgentCore Memory service in this
  implementation; the browser supplies the last 12 conversation messages.
- **S3 Vectors:** Titan Text Embeddings v2, 1,024 dimensions, cosine similarity,
  overlapping text chunks. Every query has a server-generated owner filter.
  Selected attachments additionally restrict document IDs. Only fully processed
  documents can be retrieved. Sources include download links and chunk numbers.
- **Bedrock Data Automation:** asynchronous extraction for PDFs, images, and
  audio through a provisioned extraction project and the US geographic profile. Plain text and Markdown are read
  directly. Extracted representations and transcripts are evidence; generated
  summaries are not substituted for document text. US profile processing can
  occur in US East/West regions according to AWS's routing.
- **Lambda durable functions:** checkpointed extraction, polling without idle
  compute, embedding each chunk, and archive writes. The worker is published and
  invoked through its qualified ARN. Background reports run the same AgentCore
  harness and save actual returned evidence. Job states are queued, processing,
  ready, or failed. Processing has a two-hour execution limit; extraction polling
  has a 30-minute limit. Failure details shown to users do not contain credentials.
- **S3 Tables:** an Iceberg research-artifact history queried through Athena v3.
  Documents and reports are archived with owner, ID, kind, title, creation date,
  and text excerpt/report. Writes use owner-scoped MERGE for retry idempotency;
  reads use server-authored SQL with owner constraints and escaped strings.
  This is research history, not an automatic ingest of historical market feeds
  or 13F holdings. The latter can be added as a separate dataset.

Open `/dashboard/chat` and expand **Documents & research**. Upload a file,
wait for **ready**, select it, then ask a question with an AWS model. Type a
question and choose **Research in background** to create a saved report.

## Ownership and limits

Authenticated users are scoped to their account ID through an HMAC. Anonymous
users receive a signed, HttpOnly, SameSite=Strict cookie valid for 30 days.
Clearing or expiring that cookie removes anonymous access; signing in uses a
separate account scope. The client and model cannot choose the storage owner.
Document downloads recheck ownership and use attachment disposition.

Uploads support PDF, TXT, MD, PNG, JPG/JPEG, MP3, and WAV, up to 4 MB. Extracted
text is limited to 180 KB so durable checkpoints stay bounded. Large reports
must be split. Up to eight documents can be selected per chat request. No
external user-supplied URLs are fetched by the research upload pipeline.

Research mutations reject cross-origin browser requests and limit submissions
per signed-in user or anonymous IP. Existing rate counters are per process;
they are not a shared global usage quota. Worker concurrency is capped at two
and Athena scans are capped at 100 MB per query. AWS usage is billable. Stored
documents, vectors, and tables are retained; there is no deletion UI yet.

## Deployment

Use the existing authorized account and region, never an AWS Organization.
Run `npm run test:agent`, `npm run build`, then `npm run deploy:aws`.
The deployment extends the existing `luna-ai-preview` SST app's `agents` stage.
It does not automatically change DNS or claim ownership of the main domain.

`infra/research.ts` provisions the private S3 bucket, retained vector index and
Iceberg table, Athena workgroup, Data Automation extraction project, runtime code archive, scoped execution roles,
AgentCore Runtime, and durable worker. It reuses an existing `s3tablescatalog`
without altering it, or creates the standard Glue federation with IAM access
control when absent. Existing catalog access mode must allow the scoped roles.

The site's Lambda gets `AGENTCORE_RUNTIME_ARN`, `RESEARCH_BUCKET`,
`RESEARCH_INDEX_ARN`, `RESEARCH_FUNCTION_ARN`, `RESEARCH_WORKGROUP`, and
`RESEARCH_TABLE_CATALOG` from deployment outputs. `AUTH_SECRET` comes from the
existing SST secret. The worker uses an IAM role, never workshop credentials.
Runtime code object keys include a content hash so code changes update the
runtime artifact. Run deployment from an isolated snapshot if the working tree
contains unrelated changes. Do not include `.env.local` in the source snapshot.

## Verification

`npm run test:agent` checks ownership tampering, storage keys, chunk limits,
SQL escaping, mandatory tool evidence, document grounding, runtime endpoints,
extraction parsing, and the existing hosted-model conversions. Local checks do
not establish successful cloud deployment. After deploying, verify the runtime
is READY, invoke both GPT and Claude, upload a small test document, inspect job
status through ready, ask a source-grounded question, then create a report and
query its archived history. Verify another browser cannot download the document.

The reproducible live check is `npm run smoke:agent -- https://your-site`.
It uses synthetic TXT/PDF fixtures, checks the exact retrieved codes, verifies
cross-browser access is denied, creates a background report, and asserts that
S3 Tables history returns that report's ID. Pass `--resume` after the URL to
reuse test jobs after a transient failure. The ignored `.sst/evidence` directory
holds results and temporary browser-cookie state; never commit that state.

Live verification completed October 2, 2026 (Pacific time) on the existing
`agents` preview at https://d2hz49z9ffi0hq.cloudfront.net/dashboard/chat in the
authorized `WSParticipantRole/Participant` account. Runtime version 3 was READY;
the complete smoke test passed for TXT/PDF grounding, private downloads,
background reports, and retrieval of the archived report ID. A browser check
also returned a live SPY quote through AgentCore and displayed a ready report.
Desktop and 390-pixel mobile layouts were inspected. The browser extension's
file-access setting prevented a file-chooser upload test; uploads were verified
through the deployed multipart API. The main domain's DNS was not changed.

AWS contracts used:

- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-code-deploy-node.html
- https://docs.aws.amazon.com/bedrock/latest/userguide/bda-cris.html
- https://docs.aws.amazon.com/durable-execution/sdk-reference/operations/step/
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-indexes.html
- https://docs.aws.amazon.com/athena/latest/ug/gdc-register-s3-table-bucket-cat.html
