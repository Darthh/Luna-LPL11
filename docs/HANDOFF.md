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
- Added Sign in with Apple next to Google (on hold: needs a paid developer
  account).

**2026-10-03, demo stage up to date.**
- Set the six data API keys (Finnhub, Polygon, Alpha Vantage, Exa, Twelve
  Data, Tradier) as SST secrets on `data-test`, read from `.env.local`
  without printing them.
- Redeployed `data-test` from `main` (PR #9) with `LUNA_DATA=true`.
- Smoke test passed 18/18: 10 pages, 2 APIs, MCP, and all five models
  answering with live data.
- Checked that the keys are live: `/api/research/catalysts` now reports
  `configured: true` with Finnhub news.

## 4. Current state

| | |
|---|---|
| AWS account | Workshop account `753066348022`, `us-east-1`, role `WSParticipantRole`. **May be deleted after the event.** |
| Live URL (full app) | https://d2wyrxhbmhmu6j.cloudfront.net (stage `data-test`) |
| AI-preview stage | `agents` (`npm run deploy:aws`) |
| DSQL endpoint | `xrud77dz6yqyk2nqiutq2i6mfu.dsql.us-east-1.on.aws` |
| DynamoDB table | `luna-ai-preview-data-test-LunaDataTable-evohbxsr` |
| Local AWS profile | `op1810-sst` (credential_process wrapper around `op1810`, which uses the `aws login` type SST can't read). Renew with `aws login --profile op1810`. |
| Last deploy | `data-test`, 2026-10-03, from `main` at PR #9. Smoke test 18/18. |
| Unmerged work | None. Everything is on `main`. |

Status of each area:

- **Working and verified:**
  - all pages;
  - all 5 models with tools, through AgentCore;
  - the MCP endpoint;
  - the DSQL schema;
  - the six data API keys;
  - the smoke test.
- **CI:** green on `main`.
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

## 6. What's left before the demo (anyone can pick these up)

Say in the team chat which item you're taking. Done items move to §3.

| # | Task | Who | Status |
|---|---|---|---|
| 1 | Browser test of accounts and sync (below) | Anyone with a browser | **Open** |
| 2 | Google sign-in (below) | Someone with a Google account | **Open** |
| 3 | Demo assets: CloudWatch screenshot, backup video, Claude Desktop on `/api/mcp` | Presenter | **Open** |
| 4 | Rotate the data API keys that were pasted into a chat | Key owner | **Open** |
| 5 | Auto-deploy: create the OIDC role (`docs/DEPLOY.md` §4) and the three GitHub variables | Someone with AWS + repo admin | **Open**, may be blocked by the workshop account |
| - | Data API keys on `data-test`, redeploy, smoke test | Om | Done 2026-10-03 |
| - | Apple sign-in | - | On hold (paid account) |

### 1. Browser test

On https://d2wyrxhbmhmu6j.cloudfront.net:
1. Sign up with a new email and password, sign out, sign in again.
2. Add NVDA to the watchlist and reload. It must still be there.
3. Ask the chat "What is AAPL trading at?"
4. In an incognito window, sign in with the same account. The chat from step
   3 must be in history and NVDA in the watchlist.

If something fails, note the message on screen and the time, then read the
server log:
`aws logs tail /aws/lambda/luna-ai-preview-data-test-SiteServerUseast1Function-nvndudub --since 15m --profile op1810-sst`

### 2. Google sign-in

Free, about 10 minutes. The code is done; it only needs credentials.

1. https://console.cloud.google.com → **New project** `Luna Terminal`, and
   select it.
2. https://console.cloud.google.com/auth/overview → **Get started**:
   - app name `Luna Terminal`;
   - your support email;
   - audience **External**;
   - contact email.

   Then either add the team's emails under **Audience → Test users**, or
   click **Publish app**. Basic profile and email need no Google review.
3. https://console.cloud.google.com/auth/clients → **Create client**, type
   **Web application**. Add both **Authorized redirect URIs**:
   - `https://d2wyrxhbmhmu6j.cloudfront.net/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google`
4. Copy the client ID and secret into AWS (never into chat or git):
   ```powershell
   $Env:AWS_PROFILE="op1810-sst"
   npx sst secret set AuthGoogleId <client id> --stage data-test
   npx sst secret set AuthGoogleSecret <client secret> --stage data-test
   ```
   For local dev, also add `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to
   `.env.local`.
5. Redeploy (always with `LUNA_DATA`):
   ```powershell
   $Env:LUNA_DATA="true"; npm run build:agent; npx sst deploy --stage data-test
   ```
6. Check: https://d2wyrxhbmhmu6j.cloudfront.net/api/auth/providers lists
   `google`, and **Sign in → Continue with Google** returns you signed in.

If it fails:
- `redirect_uri_mismatch`: the URI in step 3 must match exactly (https, no
  trailing slash).
- "Access blocked" or "not a test user": add the email as a test user, or
  publish the app.
- An error about the same email: that address already has a password
  account. This is deliberate (no email verification yet).

### 3. Demo assets

- **CloudWatch:** AWS console → CloudWatch → Metrics → `LunaTerminal/AI`.
  Graph `LatencyMs` (average) and `OutputTokens` (sum) by `Model`, then take
  a screenshot.
- **Backup video:** record the `docs/DEMO.md` script.
- **MCP:** in Claude Desktop, Settings → Connectors → add
  `https://d2wyrxhbmhmu6j.cloudfront.net/api/mcp`.

### After any redeploy

Run `npm run smoke:site https://d2wyrxhbmhmu6j.cloudfront.net` and expect
18/18.

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
