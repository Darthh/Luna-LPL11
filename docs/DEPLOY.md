# Deploying Luna Terminal to AWS

Infrastructure is code in [`sst.config.ts`](../sst.config.ts) (SST v4). One
command creates or updates a **stage**, an isolated copy of the stack. Stages
in use: `agents` (the AI preview in the team's workshop account), plus one per
developer, `staging` and `production` as needed.

There are two shapes, chosen with an environment variable at deploy time:

| | `npx sst deploy --stage <s>` | `LUNA_DATA=true npx sst deploy --stage <s>` |
|---|---|---|
| Site (`Site`: CloudFront → Lambda via OpenNext, streaming) | ✓ | ✓ |
| Hosted chat models on Bedrock (`lib/hostedModels.mjs`) | ✓ | ✓ |
| AgentCore runtime, S3 Vectors document search, S3 Tables history, research worker (`infra/research.ts`, see `docs/AWS_AGENT_RESEARCH.md`) | ✓ | ✓ |
| DynamoDB `LunaData`: saved chats, shared rate limits | – | ✓ |
| S3 `LunaFiles`: filing cache, avatars (Phase 3) | – | ✓ |
| Aurora DSQL `LunaDb`: accounts, watchlists, alerts, CRM | – | ✓ |
| Sign-in, watchlist, saved chats | ✗ (no database) | ✓ (after migrating, §3) |

The default is the AI preview as first deployed (see `docs/AWS_AI_PREVIEW.md`):
it creates nothing beyond the site, which suits a workshop account with
restrictive policies. Every resource is reached through the Lambda's IAM role,
so there is no database password, no AI key and no AWS key in the deployment.

## 0. Before the first deploy (once per machine)

1. **AWS CLI v2** on PATH (`aws --version`). The deploy runs it to check the
   S3 Tables catalog. Download: https://aws.amazon.com/cli/
2. **Credentials** in the same terminal. `aws sts get-caller-identity` must
   print your account. In Windows PowerShell, either:
   - workshop / temporary credentials: paste the **PowerShell** block from
     the console's "AWS CLI credentials" panel:
     ```powershell
     $Env:AWS_ACCESS_KEY_ID="..."; $Env:AWS_SECRET_ACCESS_KEY="..."; $Env:AWS_SESSION_TOKEN="..."
     $Env:AWS_REGION="us-east-1"
     ```
   - IAM Identity Center (SSO): `aws configure sso`, then
     `aws sso login --profile luna` and `$Env:AWS_PROFILE="luna"`.
   Temporary credentials expire. Re-paste them when `check:bedrock` reports
   `credentials`.
3. **The `AuthSecret`** for the stage, set once per account (skip it if a
   teammate already deployed this stage):
   ```powershell
   npx sst secret set AuthSecret ([Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))) --stage agents
   ```
4. In PowerShell, `<url>` in these docs is a placeholder: type the real
   address, e.g. `npm run smoke:site https://d1abc2def3.cloudfront.net`.
   `<` and `>` are special characters there.

## 1. Deploy

You need AWS credentials for the target account (`aws sts get-caller-identity`
works). Use a clean checkout so no local files ship with the build.

```bash
npm ci
npx sst secret set AuthSecret "$(openssl rand -base64 32)" --stage <stage>
npm run build:agent                                # AgentCore bundle, always first
npx sst deploy --stage <stage>                     # AI preview + research services
LUNA_DATA=true npx sst deploy --stage <stage>      # + accounts, saved chats, shared limits
# For the team's `agents` stage, `npm run deploy:aws` does build + deploy.
```

`sst deploy` builds with `scripts/build-aws.mjs` (OpenNext 4, with fixes for
Windows paths and Prisma's generated aliases) and prints the CloudFront URL.

Optional third-party feeds turn on when their secret is set; an unset secret
means the feature is off. These are the same keys as `.env.local.example`:

```bash
npx sst secret set FinnhubApiKey <value> --stage <stage>
# ExaApiKey, TwelvedataApiKey, AlphavantageApiKey, FmpApiKey, PolygonApiKey,
# TradierApiToken, AnthropicApiKey, AnthropicWorkspaceId, AuthGoogleId,
# AuthGoogleSecret, ResendApiKey, CronSecret, TurnstileSecretKey, PrivatePassword
# Gemini: ENABLE_GEMINI=true at deploy time plus the GeminiApiKey secret.
npx sst secret list --stage <stage>
```

Changing a secret takes effect on the next deploy. `npx sst remove --stage
<stage>` deletes a stage. `production` is protected: its resources are
retained on removal, and the table has point-in-time recovery and deletion
protection.

## 2. AI models (Bedrock)

The chat's model picker (`lib/hostedModels.mjs`) offers GPT-5.6 Sol (default),
Claude Opus 5, Llama 4 Maverick, Qwen3 and Gemma 4 on Bedrock, plus Gemini and
the key-based Luna Finance. `sst.config.ts` grants the Lambda exactly those
models: `bedrock:InvokeModel*` on their model and inference-profile ARNs, and
`bedrock-mantle:CreateInference` limited to the Qwen and Gemma model IDs.
Adding a model means adding it to both files.

Model access is set per account. On 2026-10-02 the workshop account denied
Claude Opus 5.5, Fable 5.1 and GPT-6 Astra; see `docs/AWS_AI_PREVIEW.md` for
what was tested there.

### Optional switches (off by default)

Set at deploy time; each one changes nothing until it's on. Test before turning
it on for the demo stage.

| Switch | What it does | Test first |
|---|---|---|
| `LUNA_GUARDRAIL=true` | Creates a Bedrock Guardrail that declines personal buy/sell/allocation advice and prompt attacks, applied to every Converse model call, in the site and in AgentCore | Deploy to a test stage, then `BEDROCK_GUARDRAIL_ID=<id> BEDROCK_GUARDRAIL_VERSION=<n> npm run check:bedrock`: advice declined, an ordinary market question allowed |
| `BEDROCK_PROMPT_CACHE=true` | Caches the fixed system prompt and tool list on Claude models (Converse `cachePoint`) | `BEDROCK_PROMPT_CACHE=true npm run check:bedrock`: the second Claude call reports cache reads |

Qwen and Gemma (Mantle endpoint) aren't covered by the guardrail switch.

### Metrics

Every model call writes one CloudWatch Embedded Metric Format line: namespace
`LunaTerminal/AI`, dimensions `Model` and `Model, Stage`, metrics `LatencyMs`,
`InputTokens`, `OutputTokens`, `CacheReadTokens` and `Errors`. Lambda turns them
into metrics with no setup. In CloudWatch, open **Metrics → LunaTerminal/AI**
and graph `LatencyMs` (average) and `OutputTokens` (sum) by `Model`. Lines
from the AgentCore runtime are plain JSON in its log group, for Logs Insights.

### After every deploy

```bash
npm run check:bedrock              # every model, from your credentials
npm run smoke:site <url>           # pages, APIs, and one live chat per model
```

## 3. Database schema (Aurora DSQL)

Only with `LUNA_DATA=true`. The cluster starts empty. `sst deploy` prints its
endpoint as `dsql`. Apply the schema from your machine with credentials that
can connect as the cluster admin:

```bash
DSQL_ENDPOINT=<dsql output> npm run db:migrate:dsql
```

`scripts/dsql-migrate.mjs` sends each statement in its own transaction, a DSQL
rule. It skips the foreign keys DSQL doesn't support (the Prisma schema uses
`relationMode = "prisma"`, so the client enforces relations and cascades),
builds indexes with `CREATE INDEX ASYNC`, and records every statement in
`_luna_migrations`, so re-running is safe and resumes after a failure.
`--dry-run` prints the statements without connecting.

The same script migrates a plain Postgres (`DATABASE_URL=... npm run
db:migrate`). That's how the schema is tested: migrated with no foreign keys,
it matches `prisma/schema.prisma`, and sign-up, sign-in, the watchlist and
saved chats work against it.

## 4. Deploy from GitHub Actions (OIDC, no stored keys)

`.github/workflows/deploy.yml` deploys `main` → `staging` and tags `v*` →
`production`, and can be run by hand for any stage. It is skipped until set up:

1. Create the GitHub OIDC provider in IAM (once per account):
   ```bash
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com
   ```
2. Create a role that only this repository can assume:
   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   cat > trust.json <<EOF
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Principal": { "Federated": "arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com" },
       "Action": "sts:AssumeRoleWithWebIdentity",
       "Condition": {
         "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
         "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:Darthh/Luna-LPL11:*" }
       }
     }]
   }
   EOF
   aws iam create-role --role-name luna-github-deploy --assume-role-policy-document file://trust.json
   aws iam attach-role-policy --role-name luna-github-deploy \
     --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
   ```
   SST creates IAM roles, CloudFront distributions and more, so it starts
   with admin. Narrow the policy once the resource set is stable. Workshop
   accounts usually can't create IAM roles; deploy from a laptop there.
3. In GitHub, go to **Settings → Secrets and variables → Actions → Variables**
   and add `AWS_DEPLOY_ROLE_ARN`. Optional variables: `LUNA_DATA` (`true` for
   the full app), `ALERT_FROM_EMAIL`, `LUNA_DOMAIN`.
4. Create GitHub **environments** named `staging` and `production`. Add
   required reviewers to `production` if you want a manual gate.

## 5. Local development

`npm run dev` with `.env.local`:

| Concern | Local | AWS stage |
|---|---|---|
| Accounts DB | `DATABASE_URL` (Postgres; `npm run db:migrate`) | Aurora DSQL via IAM token (`lib/prisma.js`) |
| Saved chats | In-memory (lost on restart) | DynamoDB `LunaData` |
| Rate limits | Per process | Shared DynamoDB counters |
| Bedrock models | Your AWS profile or SSO credentials | The Lambda's role |
| Secrets | `.env.local` | `sst secret` (SSM), injected as env vars |

## 6. Before you deploy

```bash
npm run lint && npm test && npm run build
```

CI (`.github/workflows/web-ci.yml`) runs the same checks on every PR.
