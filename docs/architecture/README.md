# Luna Terminal architecture

Source snapshot: **October 3, 2026 (America/Los_Angeles)**, based on `main` at `e332191`. This atlas describes the implemented repository, including configuration-gated paths. It is not a fresh AWS account inventory. Deployment status below is attributed to [HANDOFF.md](../HANDOFF.md); runtime connections are checked against source. Unrelated local dashboard edits are outside this documentation change.

Open [the diagram atlas](index.html) for all eight rendered views, [the overview image](overview.png) for a presentation, or [the architecture PDF](luna-terminal-architecture.pdf) for sharing. The Mermaid blocks below are the editable source; their SVG exports are in `diagrams/`.

**Reading key:** solid arrows represent implemented calls or data flow. Dashed arrows represent optional configuration, control-plane dependencies, or a planned connection, with the condition stated on the arrow. A node labeled **planned** is not implemented. A node labeled **provisioned / unused** exists in infrastructure code but has no current application read/write path. Arrows show the principal direction; HTTP responses and query results return along the same connection unless drawn separately.

## 1. Entire system

```mermaid
flowchart LR
  subgraph clients["Clients and local compute"]
    browser["Web browser<br/>React terminal"]
    desktop["Electron desktop<br/>hosted + offline workspace"]
    mcp["External MCP clients<br/>public read-only tools"]
    local["Local Ollama / model server"]
  end
  subgraph web["AWS web delivery - us-east-1"]
    cf["CloudFront<br/>HTTPS / cache / assets"]
    site["Site Lambda<br/>Next.js 16 + OpenNext<br/>pages / APIs / streamed chat"]
    static[("OpenNext S3<br/>static assets + ISR cache")]
  end
  subgraph ai["AWS AI and research"]
    agent["AgentCore Runtime<br/>financial tool harness"]
    models["Bedrock / Mantle<br/>GPT / Claude / Llama<br/>Qwen / Gemma"]
    worker["Durable research Lambda<br/>extraction / indexing / reports"]
    extract["Bedrock Data Automation<br/>+ Titan embeddings"]
    documents[("ResearchDocuments S3<br/>+ S3 Vectors<br/>private uploads / jobs / chunks")]
    history[("Athena + Glue + S3 Tables<br/>Iceberg research history")]
  end
  subgraph data["Account data - LUNA_DATA=true"]
    db[("Aurora DSQL<br/>accounts / CRM / advisor reports<br/>watchlists / alerts / GEX history")]
    ddb[("LunaData DynamoDB<br/>saved chats / rate counters")]
    files[("LunaFiles S3<br/>provisioned / unused by app")]
  end
  providers["Market and research feeds<br/>Yahoo / CNN / SEC / FRED<br/>Finnhub / Exa / others"]
  other["Optional Anthropic / Gemini<br/>API keys required"]
  operations["GitHub Actions + SST<br/>IAM permissions + secrets<br/>CloudWatch logs / AI metrics"]
  browser --> cf
  mcp -->|"POST /api/mcp"| cf
  desktop -->|"hosted target: fearandgreedgraph.com"| cf
  desktop -->|"isolated loopback bridge"| local
  browser -.->|"local model mode"| local
  cf --> site
  cf --> static
  site --> agent
  site --> worker
  site --> providers
  site -.->|"account APIs / IAM tokens"| db
  site -.->|"chat sync / shared limits"| ddb
  site -.->|"selected + configured"| other
  agent --> models
  agent -->|"shared market tools"| providers
  agent -->|"owner-filtered retrieval"| documents
  agent -->|"research-history search"| history
  worker --> extract
  extract -->|"text + vectors"| documents
  worker -->|"background report"| agent
  worker -->|"archive artifacts"| history
  site --> documents
  site -.-> models
  operations -.->|"deployment / telemetry"| site
```


The desktop link identifies its configured hosted origin; this diagram does not assert that origin currently resolves to the workshop deployment. The unused files bucket has no runtime arrows. OpenNext also supplies ISR revalidation infrastructure (view 8).

The always-provisioned research stack is distinct from the `LUNA_DATA=true` data stack. Bedrock and DSQL use runtime IAM credentials, not static AI keys or a database password. Third-party credentials are SST secrets injected into environment variables. No secrets or credential values are included in this atlas.

## 2. Product, analytics and upstream data

```mermaid
flowchart LR
  subgraph ui["React product surfaces"]
    dash["Overview / dashboard<br/>resizable panels / ticker tape / news"]
    stocks["Stock research / charts / screener<br/>valuation / earnings / movers / market cap"]
    geo["Market maps / company world map<br/>sectors / country ETFs / supply chain"]
    quant["Comparison / regression / what-if<br/>portfolio growth / RSI-LE / GEX"]
    funds["13F filings / manager detail<br/>ETF and fund holdings"]
    advisor["Watchlists / alerts / advisor portfolios<br/>Finance CRM / Reports"]
  end
  subgraph server["Next.js HTTP APIs + lib modules"]
    quote["Quotes / history / fundamentals<br/>yahooQuote / symbolProfile / stock-profile"]
    sentiment["fearGreed / indicators / zone<br/>CNN parsing + historical alignment"]
    earnings["earningsCalendar / stock-profile<br/>provider fallback + normalized financials"]
    holdings["thirteenF / parseHoldings<br/>ETF CUSIPs / fundHoldings / etfHoldings"]
    evidence["newsResearch / exaResearch<br/>catalyst + relationship evidence"]
    options["tradierGex / gex / impliedMove<br/>options calculations + snapshots"]
    macro["currency-matrix / yields<br/>cross rates + sovereign yields"]
    dataset["Bundled datasets<br/>stock universe / supply-chain links<br/>fund rosters / demo fallbacks"]
    compute["Client + server calculations<br/>Chart.js / Leaflet / forceLayout / treemap<br/>flowLayout / backtest / RSI / Pearson"]
  end
  subgraph upstream["External services - HTTPS"]
    yahoo["Yahoo Finance<br/>quotes / charts / screener / fundamentals / news"]
    cnn["CNN market sentiment"]
    sec["SEC EDGAR<br/>13F filings + ticker mappings"]
    etfs["StockAnalysis / Vanguard / BlackRock<br/>holdings and financials"]
    keyed["Finnhub / Polygon / Alpha Vantage / FMP<br/>Twelve Data - configured API feeds"]
    search["Exa<br/>web search + cited evidence"]
    tradier["Tradier<br/>option chains / intraday time sales"]
    fred["FRED<br/>yield-series CSV"]
    auxiliary["Nasdaq / MarketBeat / ApeWisdom<br/>Parqet logos / Wikimedia / Openverse / Bing"]
  end
  dash --> quote
  dash --> sentiment
  dash --> evidence
  stocks --> quote
  stocks --> earnings
  geo --> quote
  geo --> evidence
  geo --> holdings
  geo --> dataset
  quant --> options
  quant --> quote
  quant --> compute
  funds --> holdings
  advisor --> compute
  dash --> compute
  stocks --> compute
  geo --> compute
  dash --> macro
  quote --> yahoo
  quote -.->|"configured alternate feeds"| keyed
  sentiment --> cnn
  earnings --> yahoo
  earnings --> auxiliary
  earnings -.->|"API keys"| keyed
  earnings --> etfs
  holdings --> sec
  holdings --> etfs
  holdings --> yahoo
  evidence -.->|"Finnhub key"| keyed
  evidence -.->|"Exa key"| search
  options --> yahoo
  options -.->|"Tradier token"| tradier
  quote -.->|"intraday source"| tradier
  macro --> yahoo
  macro --> fred
  geo --> auxiliary
  quote --> auxiliary
  holdings --> dataset
```

Provider fallback order varies by endpoint; this diagram shows available integrations rather than claiming every request calls every provider. `FMP_API_KEY` has a supported path but is not one of the six keys reported configured in the handoff. Bundled/demo data is a separate source, not proof of a live feed. Cache layers are public HTTP cache headers, framework fetch caching where used, and per-process TTL/in-flight deduplication in `lib/memo.js`; there is no application Redis cache. Firecrawl is an operator troubleshooting tool for scraped upstream feeds, not a runtime dependency in this repository.

## 3. AI chat, tools and memory

```mermaid
flowchart TB
  ui["AIWorkspace / Lilo<br/>model picker + documents + account data"]
  localhistory[("Browser localStorage<br/>account-separated history / UI preferences")]
  memory["POST /api/chat-memory<br/>relevant original user-message retrieval"]
  chats["/api/chats + import + messages<br/>authenticated history synchronization"]
  ddb[("LunaData DynamoDB<br/>chat summaries + ordered messages")]
  web["POST /api/ai-research<br/>Exa evidence preparation"]
  route["POST /api/ai-chat<br/>auth / limits / last 12 messages / attachment checks"]
  identity["researchIdentity + sessionId<br/>HMAC account owner or signed anonymous cookie"]
  select{"AWS runtime path?<br/>runtime configured + AWS model<br/>workspace off OR documents attached"}
  agent["AgentCore financialAgent<br/>mandatory planning + max 4 parallel tools"]
  direct["App-server planning harness<br/>public tools + authenticated account tools"]
  tools["Shared financialAgentTools<br/>get_quote / get_history / get_market_sentiment<br/>find_page / no_data_needed"]
  private["Agent-only research tools<br/>search_documents / search_research_history"]
  workspace["App-server account tools<br/>find_account_data / create_account_document draft"]
  stores[("DSQL advisor records<br/>owner-filtered account data")]
  br["Bedrock Runtime / Mantle<br/>5 configured AWS model choices"]
  vendors["Optional Google Gemini / Anthropic<br/>keyed API paths"]
  deterministic["Luna Finance local fallback<br/>deterministic live-data response"]
  guard["Optional Bedrock Guardrail<br/>optional Claude prompt cache"]
  stream["NDJSON text / data / error events<br/>evidence + answer + source links"]
  save["Draft preview / validated save / PDF or CSV<br/>advisor-items + workspace-file APIs"]
  ui --> localhistory
  ui --> chats
  chats -.->|"CHAT_TABLE configured"| ddb
  ui --> memory
  memory -->|"signed-in account archive"| ddb
  localhistory -->|"signed-out memory selection"| ui
  ui -.->|"web search enabled"| web
  web -->|"dated untrusted excerpts"| ui
  ui --> route
  route --> identity
  route --> select
  select -->|"yes"| agent
  select -->|"no"| direct
  agent --> tools
  agent --> private
  agent --> br
  direct --> tools
  direct -.->|"account workspace enabled"| workspace
  workspace --> stores
  workspace -->|"draft only; app confirms persistence"| save
  direct --> br
  direct -.->|"selected + configured"| vendors
  direct -.->|"Luna Finance missing key / pre-stream failure"| deterministic
  guard -.->|"deployment switches"| br
  agent --> stream
  direct --> stream
  deterministic --> stream
  stream --> ui
  ui --> save
  save --> stores
```

AWS model IDs come from `lib/hostedModels.mjs`: `aws-gpt`, `aws-claude`, `aws-meta`, `aws-qwen`, `aws-gemma`. The manifest also offers `google-gemini` and `luna-finance`. Gemini deployment requires `ENABLE_GEMINI=true` and its SST secret; Luna Finance uses Anthropic when configured and a deterministic fallback otherwise.

The direct AWS path retries/fails over only before answer text is sent and discloses the answering model. The AgentCore path reports failures without switching models. Attached-document retrieval is enforced independently of the model's plan. Account workspace tools execute on the authenticated application server; when documents force the AgentCore path, account context is supplied as messages rather than exposing remote account tools. Chat-message retrieval is application memory logic, not the planned AgentCore Memory service. The browser sends recent conversation context; the agent does not independently load the complete conversation by ID.

## 4. Document ingestion and asynchronous research

```mermaid
flowchart LR
  ui["Documents and research panel"]
  api["/api/ai-documents + /api/ai-jobs<br/>identity / ownership / origin / size / rate checks"]
  s3[("ResearchDocuments S3<br/>private/owner/job/input + job.json + output")]
  worker["Qualified ResearchWorkflow Lambda ARN<br/>async invocation + durable checkpoints"]
  branch{"Job kind"}
  text["TXT / Markdown<br/>read original text"]
  extract["PDF / PNG / JPEG / MP3 / WAV<br/>Bedrock Data Automation async extraction"]
  poll["Durable wait + status polling<br/>extract text / transcript from S3"]
  chunks["Overlapping chunks<br/>2800 chars / 2400-char stride"]
  embed["Titan Text Embeddings v2<br/>1024-dimensional vectors"]
  vec[("S3 Vectors documents-v1<br/>cosine distance / owner + document metadata")]
  agent["AgentCore<br/>background research with actual evidence"]
  archive["Athena v3<br/>owner-scoped idempotent MERGE"]
  glue["Glue federated s3tablescatalog<br/>catalog / namespace / schema"]
  table[("S3 Tables Iceberg research.artifacts<br/>id / owner / kind / title / created_at / summary")]
  final["S3 job state<br/>queued - processing - ready OR failed"]
  retrieval["Agent document search<br/>embed query + owner filter + ready-state check"]
  history["Research-history search<br/>owner-filtered SQL + title substring"]
  download["GET /api/ai-documents download<br/>ownership rechecked / attachment response"]
  ui --> api
  api -->|"store upload + queued job"| s3
  api -->|"InvocationType Event"| worker
  worker --> branch
  branch -->|"document: txt/md"| text
  branch -->|"document: rich media"| extract
  extract -->|"outputs"| s3
  extract --> poll
  s3 --> text
  s3 --> poll
  text --> chunks
  poll --> chunks
  chunks --> embed
  embed --> vec
  branch -->|"report"| agent
  agent -->|"answer + evidence"| s3
  chunks -->|"document excerpt"| archive
  agent -->|"report answer"| archive
  archive --> glue
  archive --> table
  archive -->|"query results"| s3
  archive -->|"archive confirmed"| final
  worker -->|"status + bounded failure details"| final
  final --> s3
  ui -->|"poll jobs API"| api
  api -->|"read status / list jobs"| s3
  retrieval --> embed
  retrieval --> vec
  retrieval -->|"ready only"| s3
  history --> archive
  download --> s3
```

Uploads are limited to 4 MB, extracted text to 180 KB, and selected documents to eight. Retrieval returns up to six chunks. The durable worker has a two-hour execution limit, 30-minute extraction polling budget, reserved concurrency of two, and seven-day durable execution retention. Athena scans are capped at 100 MB per query. Research data is owner-scoped; account ownership and signed anonymous-cookie ownership are separate. There is no document deletion UI or automatic SEC/13F ingestion into this research index. S3 Tables archives research artifacts, not the market-data time-series database.

## 5. Accounts, persistence and alerts

```mermaid
flowchart TB
  browser["Browser<br/>AuthSessionProvider / WatchlistProvider / advisor UI"]
  proxy["proxy.js<br/>JWT-aware request middleware<br/>home Markdown content negotiation"]
  auth["Auth.js v5<br/>email + bcrypt password / JWT cookie"]
  oauth["Optional Google / Apple OAuth<br/>provider credentials required"]
  api["Account APIs<br/>profile / watchlist / alerts / advisor-clients<br/>advisor-items / account-workspace / workspace-file"]
  validate["Session-derived userId<br/>validation / ownership / revision checks"]
  prisma["Prisma 7 + PrismaPg<br/>IAM-token connection pool / TLS<br/>relationMode prisma: no DB foreign keys"]
  dsql[("Aurora DSQL - LUNA_DATA=true<br/>User / Account / WatchlistItem / FearGreedAlert<br/>AdvisorClient / AdvisorItem / ClipSnapshot")]
  localdb[("Local PostgreSQL<br/>DATABASE_URL fallback for development")]
  history["Chat APIs + chat-memory<br/>chatRepository interface"]
  ddb[("LunaData DynamoDB - LUNA_DATA=true<br/>PK / SK / GSI1 / expiresAt TTL")]
  limits["checkRateLimit<br/>atomic fixed-window counters"]
  ephemeral[("Process memory<br/>memo cache / game rooms / rate fallback<br/>development chat repository")]
  cron["/api/cron/alerts<br/>bearer secret / crossing detection"]
  schedule["PLANNED: EventBridge Scheduler<br/>no cron resource in SST config"]
  resend["Optional Resend email<br/>API key + from address required"]
  files[("LunaFiles S3<br/>provisioned; filingStore returns null")]
  edgar["SEC EDGAR<br/>filings fetched and parsed on demand"]
  export["PDF / CSV generation<br/>pdf-lib / Noto Sans / reportLayout"]
  browser --> proxy
  browser --> auth
  oauth -.->|"configured providers"| auth
  auth --> prisma
  browser --> api
  api --> validate
  validate --> prisma
  prisma -->|"DSQL_ENDPOINT set"| dsql
  prisma -.->|"DSQL endpoint absent"| localdb
  browser --> history
  history -.->|"CHAT_TABLE configured"| ddb
  browser --> limits
  limits -.->|"RATE_LIMIT_TABLE configured"| ddb
  limits -->|"no table / failure fallback"| ephemeral
  history -.->|"development only"| ephemeral
  api --> export
  schedule -.->|"planned invocation"| cron
  cron --> prisma
  cron -->|"read latest sentiment"| cnn["CNN sentiment feed"]
  cron -.->|"mailer configured"| resend
  edgar -->|"on-demand parsing; no bucket cache"| filing["thirteenF / filingStore"]
```

Profile avatars currently remain validated image data URIs in `User.image`, not S3 objects. `ClipSnapshot` is actively reused for GEX history; its old clip-bot comment does not establish an active clip service. Forum tables are retained legacy data with no forum pages/APIs. `ApiKey`, `Session`, and `VerificationToken` are schema/adapter structures, not evidence of an active API-key product, database-backed sessions, or email verification: sessions use JWT and verification is still planned. Without `CHAT_TABLE`, production chat APIs return 503 and the client keeps browser history. Without a DSQL endpoint or local database URL, account persistence is unavailable. Per-instance cache and game-room state are not durable across Lambdas.

## 6. Desktop and local model execution

```mermaid
flowchart LR
  user["Desktop user"]
  subgraph pc["User computer - Electron"]
    window["BrowserWindow<br/>contextIsolation + sandbox<br/>Node integration disabled"]
    offline["Bundled offline workspace<br/>local themes / model selection<br/>conversation held in memory"]
    preload["preload.cjs<br/>bounded window.lunaDesktop bridge"]
    main["main.cjs IPC handlers<br/>main-frame / sender / origin validation"]
    bridge["ollama.cjs<br/>loopback-only model list + bounded chat"]
    model["User-installed Ollama<br/>127.0.0.1:11434<br/>weights installed separately"]
    navigation["Allowlisted hosted navigation<br/>failed navigation returns home"]
  end
  hosted["Hard-coded desktop target<br/>https://fearandgreedgraph.com<br/>not the data-test CloudFront URL"]
  web["Web AIWorkspace local mode<br/>localhost Ollama or user-selected<br/>OpenAI-compatible endpoint"]
  build["desktop/package.json + electron-builder<br/>Windows x64 / macOS arm64 + x64"]
  ci["Manual desktop-build GitHub Action<br/>native runner tests + installers"]
  installers["Actions build artifacts<br/>EXE / DMG; release distribution is separate"]
  user --> window
  window --> offline
  offline --> preload
  preload --> main
  main --> bridge
  bridge --> model
  main --> navigation
  navigation --> hosted
  hosted -->|"if deployed UI exposes bridge"| preload
  web -->|"direct browser request; origin access required"| model
  web --> compatible["User-configured compatible server"]
  ci --> build
  build --> installers
```

The packaged local workspace has no independent live market tools and no automatic cloud fallback. The web workspace can first supply account records or Exa excerpts to its local model mode. The desktop starts on its bundled home page, not the hosted dashboard. There is no auto-update service. The desktop README describes release-download distribution, but the current AWS deploy workflow does not download installer release assets; that connection is not shown as implemented.

## 7. Agent interfaces and trust boundaries

```mermaid
flowchart LR
  external["External MCP client<br/>client supplies its own model"]
  http["/api/mcp<br/>stateless Streamable HTTP / JSON-RPC<br/>public / 300 tool calls per IP per hour"]
  protocol["mcpServer.mjs<br/>initialize / tools list / tools call"]
  shared["financialAgentTools.mjs<br/>4 public read-only MCP tools"]
  upstream["Yahoo / CNN + sitePages index"]
  inbrowser["Browser agent<br/>navigator.modelContext when supported"]
  webmcp["WebMcpTools.jsx<br/>public API wrappers + page navigation"]
  publicapi["Existing public Next.js market APIs"]
  agent["Internal AgentCore<br/>IAM-authenticated invocation"]
  private["Owner-filtered research tools<br/>documents + research history"]
  gateway["PLANNED: AgentCore Gateway<br/>Cognito OAuth / per-client identity"]
  external --> http
  http --> protocol
  protocol --> shared
  shared --> upstream
  http --> limiter["Shared DynamoDB limiter when configured<br/>per-process fallback otherwise"]
  inbrowser --> webmcp
  webmcp --> publicapi
  publicapi --> upstream
  agent --> shared
  agent --> private
  gateway -.->|"future authenticated private MCP tools"| private
```

HTTP MCP and browser WebMCP are different interfaces. Public HTTP MCP exposes only `get_quote`, `get_history`, `get_market_sentiment`, and `find_page`; it makes no model call and exposes no account data, chats, uploads, or private history. The internal harness additionally supports `no_data_needed` and its private research tools. Browser WebMCP registration is capability-detected and wraps existing public APIs. AgentCore Gateway, Cognito, and AgentCore Memory are roadmap items, not provisioned resources.

## 8. Build, deployment and observability

```mermaid
flowchart LR
  source["GitHub Darthh/Luna-LPL11<br/>main / pull requests"]
  ci["Web CI - Node 22<br/>npm ci - lint - offline tests - Next build"]
  trigger["Deploy workflow<br/>successful main push CI / v tag / manual stage"]
  gate["Configuration gates<br/>AWS_DEPLOY_ROLE_ARN required<br/>data-test / production require LUNA_DATA=true"]
  oidc["GitHub OIDC - STS<br/>assume configured deploy role"]
  agentbuild["build-agent.mjs / esbuild<br/>AgentCore Node bundle"]
  sst["SST v4 / Pulumi + CloudFormation<br/>sst.config.ts + infra/research.ts"]
  open["build-aws.mjs - OpenNext<br/>streaming wrapper + runtime preparation"]
  stack["Site + AI / research infrastructure<br/>optional data / guardrail / custom domain"]
  deploy["Deploy exact CI head SHA<br/>production retain/protect behavior"]
  smoke["smoke:site deployed URL<br/>pages / APIs / MCP / 5 AWS chat models"]
  deep["smoke:agent separate verification<br/>uploads / grounding / isolation / reports / archive"]
  secrets["SST secrets in SSM<br/>runtime env injection<br/>local development: ignored .env.local"]
  iam["Scoped execution roles<br/>models / S3 / vectors / Athena / AgentCore / DSQL"]
  logs["CloudWatch Logs<br/>structured AWS failure classification"]
  metrics["Embedded Metric Format<br/>LunaTerminal/AI by Model + Stage<br/>latency / tokens / cache reads / errors"]
  manual["Manual laptop deploy<br/>existing authenticated AWS profile"]
  cache[("OpenNext S3 assets + incremental cache")]
  tags[("OpenNext DynamoDB tag cache<br/>separate from LunaData")]
  queue["OpenNext SQS FIFO revalidation queue"]
  revalidate["OpenNext revalidation Lambda<br/>framework-managed ISR"]
  planned["PLANNED observability / operations<br/>X-Ray / WAF / budgets alarm<br/>CloudWatch dashboard / alert scheduler"]
  source --> ci
  ci -->|"successful main push"| trigger
  source -->|"tag / manual"| trigger
  trigger --> gate
  gate -.->|"configured; otherwise workflow skipped"| oidc
  oidc --> agentbuild
  agentbuild --> sst
  manual --> agentbuild
  sst --> open
  open --> deploy
  sst --> stack
  deploy --> stack
  stack --> cache
  stack --> tags
  stack --> queue
  queue --> revalidate
  revalidate -->|"revalidate through site"| stack
  stack --> smoke
  stack --> deep
  secrets -.->|"deployment resolves env values"| stack
  iam -.->|"runtime authorization"| stack
  stack --> logs
  logs --> metrics
  planned -.->|"future infrastructure"| stack
```

OpenNext supporting infrastructure is verified against the installed SST Nextjs component: S3 `_assets` / `_cache`, a separate DynamoDB tag table, an SQS FIFO revalidation queue, and its subscriber Lambda are created when the OpenNext output enables those defaults. The project does not disable incremental/tag caching. Exact generated resources depend on the build output; these are framework defaults, not a live account enumeration. Image optimization is disabled in `next.config.mjs`; no active image-optimizer path is shown. The infrastructure also includes Lambda IAM roles, permissions, and CloudWatch logging; no warmer is configured.

This diagram describes the workflow's implementation, not whether repository variables and the deploy role are currently configured. The handoff reports those prerequisites still need setup. It reports the `data-test` full-app deployment at `https://d2wyrxhbmhmu6j.cloudfront.net` on October 3 with 18/18 site smoke checks; account browser flows and cross-browser chat sync still need manual verification. `agents` is the AI/research preview. These are repository-reported observations, not newly run live checks. No deploy, cloud mutation, or AWS Organization operation is part of this atlas task.

## Source index

| Area | Source of truth |
|---|---|
| Deployment topology and switches | [sst.config.ts](../../sst.config.ts), [infra/research.ts](../../infra/research.ts), [open-next.config.ts](../../open-next.config.ts), [next.config.mjs](../../next.config.mjs) |
| Runtime status and operational caveats | [HANDOFF.md](../HANDOFF.md), [DEPLOY.md](../DEPLOY.md), [AWS_AGENT_RESEARCH.md](../AWS_AGENT_RESEARCH.md) |
| Web shell and product navigation | [app/layout.js](../../app/layout.js), [navigation.jsx](../../lib/navigation.jsx), [DashboardProvider.jsx](../../components/DashboardProvider.jsx), [sitePages.js](../../lib/sitePages.js) |
| Accounts and storage | [auth.js](../../auth.js), [auth.config.js](../../auth.config.js), [proxy.js](../../proxy.js), [schema.prisma](../../prisma/schema.prisma), [prisma.js](../../lib/prisma.js), [migrations](../../migrations) |
| Chat router and model routing | [ai-chat route](../../app/api/ai-chat/route.js), [AIWorkspace.jsx](../../components/AIWorkspace.jsx), [hostedModels.mjs](../../lib/hostedModels.mjs), [awsChat.mjs](../../lib/awsChat.mjs), [awsErrors.mjs](../../lib/awsErrors.mjs) |
| Agent runtime and shared tools | [entry.mjs](../../services/agentcore/entry.mjs), [server.mjs](../../services/agentcore/server.mjs), [financialAgent.mjs](../../lib/financialAgent.mjs), [financialAgentTools.mjs](../../lib/financialAgentTools.mjs), [agentCoreClient.mjs](../../lib/agentCoreClient.mjs) |
| Research ownership and processing | [agentIdentity.mjs](../../lib/agentIdentity.mjs), [agentResearch.mjs](../../lib/agentResearch.mjs), [workflow.mjs](../../services/research/workflow.mjs), [researchApi.mjs](../../lib/researchApi.mjs) |
| History and application memory | [chatHistory.js](../../lib/chatHistory.js), [chatRepository.mjs](../../lib/chatRepository.mjs), [chatMemory.mjs](../../lib/chatMemory.mjs), [accountChatMemory.mjs](../../lib/accountChatMemory.mjs) |
| Advisor data and exports | [financeCrmApi.mjs](../../lib/financeCrmApi.mjs), [advisorItems.mjs](../../lib/advisorItems.mjs), [accountWorkspace.mjs](../../lib/accountWorkspace.mjs), [workspaceFiles.mjs](../../lib/workspaceFiles.mjs), [reportLayout.mjs](../../lib/reportLayout.mjs) |
| Cache, quotas, filing and alerts | [memo.js](../../lib/memo.js), [rateLimit.js](../../lib/rateLimit.js), [filingStore.js](../../lib/filingStore.js), [alerts cron](../../app/api/cron/alerts/route.js), [sendEmail.js](../../lib/sendEmail.js) |
| HTTP MCP and WebMCP | [mcpServer.mjs](../../lib/mcpServer.mjs), [mcp route](../../app/api/mcp/route.js), [WebMcpTools.jsx](../../components/WebMcpTools.jsx), [MCP.md](../MCP.md) |
| Desktop and local AI | [desktop/main.cjs](../../desktop/main.cjs), [preload.cjs](../../desktop/preload.cjs), [ollama.cjs](../../desktop/ollama.cjs), [ollamaClient.mjs](../../lib/ollamaClient.mjs) |
| CI and operational evidence | [web-ci.yml](../../.github/workflows/web-ci.yml), [deploy.yml](../../.github/workflows/deploy.yml), [desktop-build.yml](../../.github/workflows/desktop-build.yml), [modelMetrics.mjs](../../lib/modelMetrics.mjs), [smoke-site.mjs](../../scripts/smoke-site.mjs), [smoke-agent.mjs](../../scripts/smoke-agent.mjs) |

## Complete route inventory

The following lists every tracked App Router page and HTTP route in this snapshot. Route groups such as `(legal)` are removed from public paths. Dynamic bracket segments are retained. Redirect aliases in `next.config.mjs` do not create additional pages; notably `/hedge-funds` redirects to `/13Filings`. Endpoint existence does not mean authentication, external feeds, or persistence are configured.

<!-- ROUTE_INVENTORY -->

**40 page entry points and 58 HTTP route handlers.**

| Page | Source |
|---|---|
| `/about` | [app/(legal)/about/page.js](../../app/(legal)/about/page.js) |
| `/accessibility` | [app/(legal)/accessibility/page.js](../../app/(legal)/accessibility/page.js) |
| `/contact` | [app/(legal)/contact/page.js](../../app/(legal)/contact/page.js) |
| `/privacy` | [app/(legal)/privacy/page.js](../../app/(legal)/privacy/page.js) |
| `/terms` | [app/(legal)/terms/page.js](../../app/(legal)/terms/page.js) |
| `/13Filings/[cik]` | [app/13Filings/[cik]/page.js](../../app/13Filings/[cik]/page.js) |
| `/13Filings` | [app/13Filings/page.js](../../app/13Filings/page.js) |
| `/ai-bot` | [app/ai-bot/page.js](../../app/ai-bot/page.js) |
| `/alerts` | [app/alerts/page.js](../../app/alerts/page.js) |
| `/chart-metrics` | [app/chart-metrics/page.js](../../app/chart-metrics/page.js) |
| `/client-portfolios` | [app/client-portfolios/page.js](../../app/client-portfolios/page.js) |
| `/company-world-map` | [app/company-world-map/page.js](../../app/company-world-map/page.js) |
| `/country-etfs` | [app/country-etfs/page.js](../../app/country-etfs/page.js) |
| `/currencies` | [app/currencies/page.js](../../app/currencies/page.js) |
| `/dashboard/chat/[id]` | [app/dashboard/chat/[id]/page.js](../../app/dashboard/chat/[id]/page.js) |
| `/dashboard/chat` | [app/dashboard/chat/page.js](../../app/dashboard/chat/page.js) |
| `/dashboard` | [app/dashboard/page.js](../../app/dashboard/page.js) |
| `/earnings-calendar` | [app/earnings-calendar/page.js](../../app/earnings-calendar/page.js) |
| `/finance-crm` | [app/finance-crm/page.js](../../app/finance-crm/page.js) |
| `/font-preview` | [app/font-preview/page.js](../../app/font-preview/page.js) |
| `/global-markets` | [app/global-markets/page.js](../../app/global-markets/page.js) |
| `/global-yields` | [app/global-yields/page.js](../../app/global-yields/page.js) |
| `/graphs/comparison` | [app/graphs/comparison/page.js](../../app/graphs/comparison/page.js) |
| `/graphs/historical` | [app/graphs/historical/page.js](../../app/graphs/historical/page.js) |
| `/lots-of-charts` | [app/lots-of-charts/page.js](../../app/lots-of-charts/page.js) |
| `/maps` | [app/maps/page.js](../../app/maps/page.js) |
| `/market-cap` | [app/market-cap/page.js](../../app/market-cap/page.js) |
| `/market-movers` | [app/market-movers/page.js](../../app/market-movers/page.js) |
| `/model-portfolios` | [app/model-portfolios/page.js](../../app/model-portfolios/page.js) |
| `/` | [app/page.js](../../app/page.js) |
| `/portfolio-comparison` | [app/portfolio-comparison/page.js](../../app/portfolio-comparison/page.js) |
| `/regression-analysis` | [app/regression-analysis/page.js](../../app/regression-analysis/page.js) |
| `/reports` | [app/reports/page.js](../../app/reports/page.js) |
| `/rsi-le` | [app/rsi-le/page.js](../../app/rsi-le/page.js) |
| `/screener` | [app/screener/page.js](../../app/screener/page.js) |
| `/stock/[symbol]` | [app/stock/[symbol]/page.js](../../app/stock/[symbol]/page.js) |
| `/supply-chain` | [app/supply-chain/page.js](../../app/supply-chain/page.js) |
| `/us-sectors` | [app/us-sectors/page.js](../../app/us-sectors/page.js) |
| `/watchlist` | [app/watchlist/page.js](../../app/watchlist/page.js) |
| `/what-if` | [app/what-if/page.js](../../app/what-if/page.js) |

| HTTP path | Exported methods | Source |
|---|---|---|
| `/api/account-workspace` | POST | [app/api/account-workspace/route.js](../../app/api/account-workspace/route.js) |
| `/api/advisor-clients` | DELETE, GET, POST, PUT | [app/api/advisor-clients/route.js](../../app/api/advisor-clients/route.js) |
| `/api/advisor-items` | DELETE, GET, POST, PUT | [app/api/advisor-items/route.js](../../app/api/advisor-items/route.js) |
| `/api/ai-chat` | POST | [app/api/ai-chat/route.js](../../app/api/ai-chat/route.js) |
| `/api/ai-documents` | GET, POST | [app/api/ai-documents/route.js](../../app/api/ai-documents/route.js) |
| `/api/ai-jobs` | POST | [app/api/ai-jobs/route.js](../../app/api/ai-jobs/route.js) |
| `/api/ai-research` | POST | [app/api/ai-research/route.js](../../app/api/ai-research/route.js) |
| `/api/alerts` | DELETE, GET, POST | [app/api/alerts/route.js](../../app/api/alerts/route.js) |
| `/api/auth/[...nextauth]` | GET, POST | [app/api/auth/[...nextauth]/route.js](../../app/api/auth/[...nextauth]/route.js) |
| `/api/auth/register` | POST | [app/api/auth/register/route.js](../../app/api/auth/register/route.js) |
| `/api/chart-metrics` | GET | [app/api/chart-metrics/route.js](../../app/api/chart-metrics/route.js) |
| `/api/chat-memory` | POST | [app/api/chat-memory/route.js](../../app/api/chat-memory/route.js) |
| `/api/chats/[id]/messages` | POST | [app/api/chats/[id]/messages/route.js](../../app/api/chats/[id]/messages/route.js) |
| `/api/chats/[id]` | DELETE, GET, PATCH | [app/api/chats/[id]/route.js](../../app/api/chats/[id]/route.js) |
| `/api/chats/import` | POST | [app/api/chats/import/route.js](../../app/api/chats/import/route.js) |
| `/api/chats` | GET | [app/api/chats/route.js](../../app/api/chats/route.js) |
| `/api/company-hq-photo` | GET | [app/api/company-hq-photo/route.js](../../app/api/company-hq-photo/route.js) |
| `/api/company-world-map` | GET | [app/api/company-world-map/route.js](../../app/api/company-world-map/route.js) |
| `/api/cron/alerts` | GET | [app/api/cron/alerts/route.js](../../app/api/cron/alerts/route.js) |
| `/api/currency-matrix` | GET | [app/api/currency-matrix/route.js](../../app/api/currency-matrix/route.js) |
| `/api/earnings-calendar` | GET | [app/api/earnings-calendar/route.js](../../app/api/earnings-calendar/route.js) |
| `/api/etf-holdings` | GET | [app/api/etf-holdings/route.js](../../app/api/etf-holdings/route.js) |
| `/api/event-news` | GET | [app/api/event-news/route.js](../../app/api/event-news/route.js) |
| `/api/fear-greed/csv` | GET | [app/api/fear-greed/csv/route.js](../../app/api/fear-greed/csv/route.js) |
| `/api/fear-greed` | GET | [app/api/fear-greed/route.js](../../app/api/fear-greed/route.js) |
| `/api/game-room` | GET, POST | [app/api/game-room/route.js](../../app/api/game-room/route.js) |
| `/api/gate` | GET, POST | [app/api/gate/route.js](../../app/api/gate/route.js) |
| `/api/hedge-funds` | GET | [app/api/hedge-funds/route.js](../../app/api/hedge-funds/route.js) |
| `/api/implied-move` | GET | [app/api/implied-move/route.js](../../app/api/implied-move/route.js) |
| `/api/index-movers` | GET | [app/api/index-movers/route.js](../../app/api/index-movers/route.js) |
| `/api/logo` | GET | [app/api/logo/route.js](../../app/api/logo/route.js) |
| `/api/market-cap-ranking` | GET | [app/api/market-cap-ranking/route.js](../../app/api/market-cap-ranking/route.js) |
| `/api/market-news` | GET | [app/api/market-news/route.js](../../app/api/market-news/route.js) |
| `/api/mcp` | GET, OPTIONS, POST | [app/api/mcp/route.js](../../app/api/mcp/route.js) |
| `/api/popular-stocks` | GET | [app/api/popular-stocks/route.js](../../app/api/popular-stocks/route.js) |
| `/api/portfolio-performance` | POST | [app/api/portfolio-performance/route.js](../../app/api/portfolio-performance/route.js) |
| `/api/prices` | GET | [app/api/prices/route.js](../../app/api/prices/route.js) |
| `/api/profile` | GET, PATCH | [app/api/profile/route.js](../../app/api/profile/route.js) |
| `/api/research/catalysts` | GET | [app/api/research/catalysts/route.js](../../app/api/research/catalysts/route.js) |
| `/api/research/supply-chain` | GET | [app/api/research/supply-chain/route.js](../../app/api/research/supply-chain/route.js) |
| `/api/screener` | GET | [app/api/screener/route.js](../../app/api/screener/route.js) |
| `/api/spy-gex/change` | POST | [app/api/spy-gex/change/route.js](../../app/api/spy-gex/change/route.js) |
| `/api/spy-gex/history` | GET, POST | [app/api/spy-gex/history/route.js](../../app/api/spy-gex/history/route.js) |
| `/api/spy-gex` | GET | [app/api/spy-gex/route.js](../../app/api/spy-gex/route.js) |
| `/api/stock-chart` | GET | [app/api/stock-chart/route.js](../../app/api/stock-chart/route.js) |
| `/api/stock-map` | GET | [app/api/stock-map/route.js](../../app/api/stock-map/route.js) |
| `/api/stock-profile` | GET | [app/api/stock-profile/route.js](../../app/api/stock-profile/route.js) |
| `/api/stock-search` | GET | [app/api/stock-search/route.js](../../app/api/stock-search/route.js) |
| `/api/ticker-tape` | GET | [app/api/ticker-tape/route.js](../../app/api/ticker-tape/route.js) |
| `/api/valuation-compare` | GET | [app/api/valuation-compare/route.js](../../app/api/valuation-compare/route.js) |
| `/api/valuation-history` | GET | [app/api/valuation-history/route.js](../../app/api/valuation-history/route.js) |
| `/api/volume-stocks` | GET | [app/api/volume-stocks/route.js](../../app/api/volume-stocks/route.js) |
| `/api/watchlist-meta` | GET | [app/api/watchlist-meta/route.js](../../app/api/watchlist-meta/route.js) |
| `/api/watchlist-quotes` | GET | [app/api/watchlist-quotes/route.js](../../app/api/watchlist-quotes/route.js) |
| `/api/watchlist` | DELETE, GET, PATCH, POST, PUT | [app/api/watchlist/route.js](../../app/api/watchlist/route.js) |
| `/api/workspace-file` | POST | [app/api/workspace-file/route.js](../../app/api/workspace-file/route.js) |
| `/api/yields` | GET | [app/api/yields/route.js](../../app/api/yields/route.js) |
| `/index.md` | GET | [app/index.md/route.js](../../app/index.md/route.js) |

<!-- END_ROUTE_INVENTORY -->
## Regenerating the diagrams

Use Node 22 and a local Chrome installation (or set `ARCHITECTURE_BROWSER` to another Chromium executable). No application dependency changes are needed. The renderer uses Mermaid CLI 12.0.0 through `npm exec` and the existing `pdf-lib` dependency:

```powershell
node docs/architecture/render.mjs
```

The renderer regenerates the tracked route inventory, eight numbered SVGs, overview PNG, eight-page PDF, and offline HTML atlas. Temporary renderer inputs and intermediate PDFs go into a task-owned system temporary directory. Numbered exports correspond to the eight headings above. Keep exported views synchronized after editing their Mermaid source. The source snapshot label is deliberate: update it when reviewing a newer repository revision.
