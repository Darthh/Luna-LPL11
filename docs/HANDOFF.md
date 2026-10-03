# Handoff: where Luna Terminal is, how it got here, what's next

For anyone (person or agent) picking the project up. Last updated 2026-10-03.
Read this first, then `AGENTS.md`, `docs/DEPLOY.md`, `docs/DEMO.md`,
`docs/BACKEND_PLAN.md` (the full plan and roadmap) and `docs/MCP.md`.

## 1. What Luna Terminal is

A free financial research terminal for traders and financial advisors:
- **Market data:** dashboards, a market-sentiment ("fear & greed") index,
  stock pages with charts and valuation history, a screener, an earnings
  calendar, hedge-fund 13F holdings, market maps and supply-chain graphs.
- **Advisor tools:** watchlists, alerts, and client/portfolio workspaces.
- **An AI assistant ("Lilo")** that answers market questions with live,
  dated data from tools, and can search documents the user uploads.

It is built for a hackathon with a **"Best use of AWS"** track.

The team:
- **Darthh** owns the repository. Darthh built the original app, the
  multi-model Bedrock chat (`lib/hostedModels.mjs`), the AgentCore runtime
  and research services (`infra/research.ts`) and `lib/awsAuth.mjs`.
- **Om Patel** did the AWS backend, deployment, chat history, data stack,
  reliability and MCP work below.
- **nealjariwala23** also contributed.

## 2. Architecture in one picture

```
Browser ──► CloudFront ──► Lambda "Site" (Next.js 16 via OpenNext, streaming)
                             ├─► Bedrock: 5 hosted models (GPT-5.6 Sol default, Claude Opus 5,
                             │            Llama 4 Maverick, Qwen3, Gemma 4), scoped IAM, no keys
                             ├─► Bedrock AgentCore runtime: the tool-using chat agent
                             ├─► S3 Vectors + Titan embeddings: uploaded-document search
                             ├─► S3 Tables / Athena: research history
                             ├─► Lambda durable functions: document extraction, reports
                             ├─► DynamoDB "LunaData": saved chats, shared rate limits    ┐ only with
                             ├─► S3 "LunaFiles": filing cache, avatars                   │ LUNA_DATA=true
                             └─► Aurora DSQL "LunaDb": accounts, watchlists, alerts, CRM ┘
External AI agents ──► /api/mcp (same tool code, read-only, no sign-in)
```

- **No keys:** every AWS call goes through the Lambda's IAM role. There is no
  database password and no AI key. Third-party API keys are SST secrets
  (`npx sst secret set <Name> <value> --stage <stage>`), stored in SSM.
- **Infrastructure is code:** `sst.config.ts` plus `infra/research.ts`
  (SST v4).
- **Sign-in:** Auth.js v5 with JWT sessions. Email/password always; Google
  and Apple when their secrets are set.
- **Database:** Prisma 7 with `relationMode = "prisma"`, because DSQL has no
  foreign keys.
- **Saved chats:** written to localStorage first, then synced in the
  background to `/api/chats`, which is backed by DynamoDB.

## 3. History: what was built

**Plan.** `docs/BACKEND_PLAN.md` was written on the `backend-aws-plan`
branch: the target AWS architecture, the chat-history contract and a phased
roadmap.

**Foundations.**
- `npm test` runs every offline test (`scripts/run-tests.mjs`).
- CI (`.github/workflows/web-ci.yml`) runs lint, tests and build on every PR.

**Chat history across devices.**
- `lib/chats.mjs` validates chats; `lib/chatRepository.mjs` stores them, in
  memory locally and in DynamoDB on AWS.
- The API routes are `/api/chats`, `/api/chats/[id]`,
  `/api/chats/[id]/messages` and `/api/chats/import`.
- `lib/chatHistory.js` syncs in the background: localStorage first, then the
  server.

**Data stack.** All of it is behind `LUNA_DATA=true`.
- DynamoDB single table: `PK`/`SK` keys, a `GSI1` index, and TTL on
  `expiresAt`.
- Aurora DSQL with IAM-token auth (`lib/prisma.js`).
- The migration runner `npm run db:migrate:dsql`. It runs one statement per
  transaction, skips foreign keys, uses `CREATE INDEX ASYNC`, and is
  resumable through a ledger.
- A shared DynamoDB rate limiter (`lib/rateLimit.js`).

**The "AWS model could not answer, every ~15 min" bug.**
- Cause: the local workshop credentials were expiring. The deployed site,
  which uses its Lambda role, is unaffected.
- Added `lib/awsErrors.mjs`. It classifies AWS errors (credentials, access
  denied, throttled and so on), logs them as JSON, retries once, then fails
  over to a backup model (GPT ↔ Claude).
- `npm run check:bedrock` probes every model and shows when the credentials
  expire.

**Speed.** Tools run in parallel inside the agent.

**AWS showcase.**
- CloudWatch metrics per model call (`LunaTerminal/AI`: latency, tokens,
  errors).
- An optional Bedrock Guardrail that blocks personal buy/sell advice
  (`LUNA_GUARDRAIL`).
- Optional Claude prompt caching (`BEDROCK_PROMPT_CACHE`).
- An architecture diagram and demo script in `docs/DEMO.md`.

**Deployment hardening.**
- A fresh checkout deploys: SST globals replace imports from `.sst/platform`.
- `npm run smoke:site <url>` checks pages, APIs, MCP and one live chat per
  model.
- Windows/PowerShell setup is in `docs/DEPLOY.md` §0.

**First real deploys (2026-10-02/03).**
- Stage `agents` is the AI preview.
- Stage `data-test` has the full data stack.
- The DSQL migration applied 34 statements.
- The smoke test passed 17/17, with all five models answering through
  AgentCore.

**After that.**
- Fixed sign-up: the Cloudflare Turnstile key only worked on the old domain.
  The bot check is now optional, off unless `TURNSTILE_SITE_KEY` and the
  secret are both set.
- Added the MCP server at `/api/mcp`.
- Fixed CI. `test-appearance` didn't know about `app/padres.css`, and that
  failure blocked every run.
- Added auto-deploy after CI.
- Added Sign in with Apple next to Google.

## 4. Current state

| | |
|---|---|
| AWS account | Workshop account `753066348022`, `us-east-1`, role `WSParticipantRole`. **May be deleted after the event.** |
| Live URL (full app) | https://d2wyrxhbmhmu6j.cloudfront.net (stage `data-test`) |
| AI-preview stage | `agents` (`npm run deploy:aws`) |
| DSQL endpoint | `xrud77dz6yqyk2nqiutq2i6mfu.dsql.us-east-1.on.aws` |
| DynamoDB table | `luna-ai-preview-data-test-LunaDataTable-evohbxsr` |
| Local AWS profile | `op1810-sst` (credential_process wrapper around `op1810`, which uses the `aws login` type SST can't read). Renew with `aws login --profile op1810`. |
| Branch with unmerged work | `claude/dreamy-planck-eatgrb`: CI fix, auto-deploy, Apple sign-in, this doc. Open a PR to `main`. |

Status of each area:

- **Working and verified:**
  - all pages;
  - all 5 models with tools, through AgentCore;
  - the DSQL schema;
  - the smoke test.
- **Deployed, not yet verified in a browser:**
  - sign-up, sign-in and the watchlist;
  - chat history across two browsers.
- **Built, needs setup:**
  - Google sign-in: OAuth client and redirect URI, then the `AuthGoogleId`
    and `AuthGoogleSecret` secrets.
  - Apple sign-in: **on hold** (needs a $99/yr Apple Developer account). The
    code is in and stays hidden until `AuthAppleId`/`AuthAppleSecret` are set.
  - Auto-deploy: an OIDC role plus GitHub variables `AWS_DEPLOY_ROLE_ARN`,
    `DEPLOY_STAGE=data-test` and `LUNA_DATA=true`. The workshop account may
    deny creating IAM roles.
  - Third-party data keys: Finnhub, Polygon, Alpha Vantage, Exa, Twelve Data
    and Tradier, as SST secrets on `data-test`.
- **Built, off:**
  - the Guardrail;
  - prompt caching;
  - Turnstile.

## 5. Rules and gotchas learned the hard way

- **Never deploy `data-test` without `LUNA_DATA=true`.** SST would delete
  the database, table and bucket. The auto-deploy workflow refuses; a manual
  deploy does not.
- **Secrets:**
  - Never commit `.env.local` or credentials.
  - Never share `npx sst secret list` output; it prints the values.
  - A secret change takes effect only on the next deploy.
- **DSQL:**
  - one DDL statement per transaction;
  - no foreign keys;
  - IAM-token auth, so there is no `DATABASE_URL` on AWS.
  - Schema changes go in a **new** `migrations/000N_*.sql` file, then
    `npm run db:migrate:dsql`. Never edit old migrations.
- **Credentials:**
  - Workshop credentials expire. "Could not answer" locally usually means
    run `aws login --profile op1810` again.
  - The deployed site uses its own role, so it is unaffected.
- **Windows:**
  - In PowerShell, `<url>` in docs is a placeholder. `<` breaks the command.
  - Paste multi-line blocks one line at a time.
  - If SST's UI garbles the terminal, check `.sst/outputs.json`, or set
    `CI=true`.
- **Stale comments:** any comment about Cloudflare Workers, bindings, D1, KV
  or wrangler is stale (`AGENTS.md`).
- **Upstream data:**
  - Yahoo throttles automated requests with a consent page and no numbers.
  - Stockanalysis.com is scraped.
  - When a feed breaks, see the firecrawl note in `AGENTS.md`.
- **Commits** are authored as `Om Patel <156618510+ompatel181005@users.noreply.github.com>`,
  with no AI attribution lines. Work goes through PRs to `main`.

## 6. Immediate next steps (demo readiness)

1. Merge the PR from `claude/dreamy-planck-eatgrb`. CI on `main` must go
   green.
2. Set the data API secrets on `data-test`, then redeploy:
   ```powershell
   $Env:AWS_PROFILE="op1810-sst"; $Env:LUNA_DATA="true"
   npm run build:agent; npx sst deploy --stage data-test
   ```
3. Run `npm run check:bedrock` (all OK), then
   `npm run smoke:site https://d2wyrxhbmhmu6j.cloudfront.net` (18/18).
4. Test in the browser:
   - sign up, then sign in;
   - add a watchlist item;
   - ask a chat question;
   - open an incognito window, sign in, and check the history and watchlist
     are there.
5. Set up Google sign-in. (Apple is on hold: it needs a paid developer account.)
6. Try the OIDC role for auto-deploy (`docs/DEPLOY.md` §4).
7. Demo assets:
   - a screenshot of CloudWatch → Metrics → LunaTerminal/AI;
   - a backup screen recording of the `docs/DEMO.md` script;
   - Claude Desktop connected to `/api/mcp` for demo step 7.

## 7. What to build next

Ordered by value for the AWS track first, then for the product. Details and
rationale are in `docs/BACKEND_PLAN.md` §5–§8 and §10.

**Small, high-value**
- **Turn on the built switches.** Deploy a test stage with
  `LUNA_GUARDRAIL=true`. Run `check:bedrock` with the guardrail ID: advice
  must be declined and ordinary questions allowed. Then enable it, and
  `BEDROCK_PROMPT_CACHE`, on the demo stage.
- **Alerts actually firing.** `app/api/cron/alerts` exists but nothing calls
  it on AWS; the Cloudflare cron is gone.
  - Add an EventBridge Scheduler rule (`sst.aws.Cron`) that calls it with
    `CRON_SECRET`.
  - Send email with SES, or Resend (`ResendApiKey` plus `ALERT_FROM_EMAIL`).
- **CloudWatch dashboard and a Budgets alarm** in `sst.config.ts`: latency
  and tokens per model, errors, and a monthly cost cap.
- **Server-side chat history load** by `chatId`, so a new device gets the
  full conversation without a localStorage copy.

**Medium**
- **AgentCore Gateway in front of MCP**, with Cognito OAuth, so per-user
  tools (`search_documents`, `search_research_history`) can be exposed
  safely (docs/MCP.md).
- **AgentCore Memory** for long-term user preferences, such as favourite
  tickers and risk profile.
- **SEC 10-K ingestion into S3 Vectors**, so questions like "which companies
  mention supply-chain risk?" work without uploads. Run it as a Step
  Functions job.
- **Step Functions 13F ingestion → S3** (the `LunaFiles` filing cache),
  instead of parsing on request.
- **S3 presigned avatar uploads**; move the `memo` cache and game rooms to
  DynamoDB.
- **Async chat titles** via DynamoDB Streams.

**Hardening**
- **AWS WAF:**
  - rate rules on `/api/*`;
  - CAPTCHA on `/api/auth/register`, replacing Turnstile for good.
- **Account deletion across stores:** DSQL rows, DynamoDB chats and S3
  objects.
- **Email verification on sign-up.** After that, Google and Apple accounts
  can safely auto-link with password accounts that share an email.
- **Observability:** X-Ray tracing. Load-test the chat and map routes, and
  trace them with chrome-devtools (`AGENTS.md`).
- **Narrow the deploy role** from `AdministratorAccess` to what SST needs.
- **A `production` stage in a permanent account:** the workshop account is
  temporary. Use a custom domain (`LUNA_DOMAIN`) and point the Google/Apple
  callbacks at it.
- **Remove stale Cloudflare-era comments.**
