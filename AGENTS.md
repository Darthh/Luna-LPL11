# Commit and push workflow

For this project, after every prompt that changes project files, verify the
requested work, commit only the task's changes, and push to `main` in
`Darthh/Luna-LPL11` (`https://github.com/Darthh/Luna-LPL11.git`). Keep secrets
and unrelated user changes out of commits. Report any push failure. Prompts
that make no file changes do not require an empty commit.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MCP routing

**context7** — before writing any Next 16 / React 19 API from memory: caching
(`use cache`, `cacheLife`, `revalidate`), PPR, `next/dynamic`, route handlers.
Pairs with the rule above; `node_modules/next/dist/docs/` is the other source.

**chrome-devtools** — never guess at performance. `npm run dev`, then trace the
routes that do real main-thread work:

| route | heavy part |
|---|---|
| `/` | `components/ChartPanel.jsx` + `FearGreedIndicators.jsx` (chart.js) |
| `/stock/[symbol]` | chart.js, imported by the page directly |
| `/maps` | `components/StockMap.jsx` → `lib/forceLayout.js`, `lib/treemap.js` |
| `/supply-chain` | `components/SupplyChain.jsx` → `lib/flowLayout.js` |
| `/hedge-funds` | `components/HedgeFundDetail.jsx` (chart.js) |

Read long tasks and LCP/INP attribution from a trace before touching any of
them. Same for "why is this chart janky" — record a trace over the interaction
rather than reasoning about it.

**AWS** — the app deploys to AWS via SST (`sst.config.ts`): Next.js on Lambda
behind CloudFront, Aurora DSQL for accounts, S3 for parsed 13F filings, Bedrock
for the keyless AI Bot tier, EventBridge for the alert cron. It was on
Cloudflare Workers before; any comment still mentioning a Worker, a binding, D1,
KV or wrangler is stale, not a live contract. Two DSQL rules bite: one DDL
statement per transaction (hence `scripts/dsql-migrate.mjs` rather than
`prisma migrate deploy`), and IAM-token auth rather than a password, so there is
no static `DATABASE_URL` and `lib/prisma.js` builds its own per client.

**firecrawl** — for the scraped upstream feeds only, never our own pages. The
undocumented sources are `lib/yahooQuote.js` (Yahoo answers throttled requests
with a consent page and no numbers) and the stockanalysis.com endpoint used by
`lib/etfHoldings.js`, `lib/fundHoldings.js` and `app/api/stock-profile/route.js`.
Firecrawl renders those, but costs API credits per call — reach for it when a
feed breaks, not as the default fetch.

<!-- BEGIN AWS Agent Toolkit rules -->
# AWS Guidance
- Where these AWS rules conflict with the project's own instructions, the
  project's instructions take precedence.
- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.
## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
<!-- END AWS Agent Toolkit rules -->
