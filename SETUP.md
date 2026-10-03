# Setting up and running Luna Terminal

Three levels. Each one builds on the one before, so stop at the first that
covers what you need.

| Level | You get | You need |
|---|---|---|
| **1. Quick start** | All market pages: dashboard, stock pages, 13F filings, maps, supply chain, screener | Node.js only |
| **2. Accounts** | Sign-up and sign-in, watchlists, saved chats, advisor workspace, reports | + PostgreSQL |
| **3. AI on AWS** | The AI chat on Amazon Bedrock (5 models), document search, research reports | + an AWS account with Bedrock |

Deploying your own copy to AWS is covered in [docs/DEPLOY.md](docs/DEPLOY.md).
A hosted demo is at https://d2wyrxhbmhmu6j.cloudfront.net.

---

## Before you start

Install these first:

- **Node.js 22 or newer** (https://nodejs.org). `node --version` should print `v22` or higher.
- **Git** (https://git-scm.com).
- For level 2: **Docker Desktop** (https://www.docker.com), or any PostgreSQL 16.
- For level 3: the **AWS CLI v2** (https://aws.amazon.com/cli/).

Commands below work in macOS/Linux terminals and in Windows PowerShell; the
places they differ are marked.

## 1. Quick start (no keys, about 5 minutes)

```bash
git clone https://github.com/Darthh/Luna-LPL11.git
cd Luna-LPL11
npm ci
cp .env.local.example .env.local      # Windows PowerShell: Copy-Item .env.local.example .env.local
npm run dev
```

Open http://localhost:3000. Try `/dashboard`, `/stock/NVDA`, `/13Filings`,
`/supply-chain` and `/screener`.

Market data comes from public feeds, so no keys are needed. Optional keys add
more data; each one is described in `.env.local.example` and the README's
**Configuration** table. Put them in `.env.local`, which git ignores. Never
commit it.

## 2. Accounts (sign-in, watchlist, saved chats)

1. Start a local PostgreSQL:
   ```bash
   docker run -d --name luna-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=lunaterminal postgres:16
   ```
2. In `.env.local`, set:
   ```
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lunaterminal
   AUTH_SECRET=<any long random string>
   ```
   To generate a secret: `npx auth secret`, or `openssl rand -base64 32`.
3. Create the tables. The migration script doesn't read `.env.local`, so
   pass the URL in the command:
   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lunaterminal npm run db:migrate
   ```
   In Windows PowerShell:
   ```powershell
   $Env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lunaterminal"; npm run db:migrate
   ```
4. Restart `npm run dev`, then click **Sign up**.

Locally, saved chats are kept in memory and reset when the server restarts.
On AWS they're stored in DynamoDB.

Google sign-in is optional. See *Google and Apple sign-in* in
[docs/DEPLOY.md](docs/DEPLOY.md) and use the redirect URI
`http://localhost:3000/api/auth/callback/google`.

## 3. AI chat on Amazon Bedrock

The chat runs on Amazon Bedrock, through your own AWS credentials. There is
no AI API key.

1. **Model access.** In the AWS console, go to **Bedrock → Model access** in
   `us-east-1` and request access to the models the chat offers:
   - GPT-5.6 Sol;
   - Claude Opus 5;
   - Llama 4 Maverick;
   - Qwen3 235B;
   - Gemma 4 31B.

   One is enough to start. The full list is in `lib/hostedModels.mjs`.
2. **Sign in to AWS** in the same terminal you'll run the app from:
   ```bash
   aws login                    # or: aws configure sso / aws sso login
   aws sts get-caller-identity  # must print your account
   ```
3. Point the app at that profile in `.env.local`:
   ```
   BEDROCK_AWS_PROFILE=<your profile name, e.g. default>
   BEDROCK_REGION=us-east-1
   ```
4. Check each model before starting the app:
   ```bash
   npm run check:bedrock
   ```
   Every model you have access to should say `OK`. A `FAIL` line names the
   reason: `credentials` (sign in again), `access_denied` (request model
   access) or `throttled` (wait a minute).
5. Restart `npm run dev` and open http://localhost:3000/dashboard/chat.

**Costs:** each question is a few Bedrock calls, typically under a cent.
Local AWS sign-ins expire after a while. If the chat says AWS rejected the
credentials, run `aws login` again.

**Private local chat (no AWS):** install Ollama, run
`ollama pull llama3.2`, and choose **Ollama** in the chat's model picker.

## Checks

```bash
npm run lint     # code style
npm test         # unit tests, offline
npm run build    # production build
```

CI runs these three steps on every pull request.

Against a running or deployed site:
```bash
npm run smoke:site http://localhost:3000    # pages, APIs, MCP, one chat per model
```

## Deploying to AWS

One command creates the whole stack: CloudFront, Lambda, Bedrock
permissions, AgentCore, DynamoDB, Aurora DSQL and S3. Follow
[docs/DEPLOY.md](docs/DEPLOY.md). The short version:

```bash
npx sst secret set AuthSecret "<random string>" --stage <your-stage>
npm run build:agent
LUNA_DATA=true npx sst deploy --stage <your-stage>     # PowerShell: $Env:LUNA_DATA="true"; npx sst deploy --stage <your-stage>
npm run db:migrate:dsql                                # with DSQL_ENDPOINT set to the printed `dsql` output
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm ci` fails | Check `node --version` is 22+. Delete `node_modules` and retry. |
| A page shows "configure X_API_KEY" | That panel needs an optional key; the rest of the site works. |
| Sign-up fails | `DATABASE_URL` and `AUTH_SECRET` are set, Postgres is running, and you ran `npm run db:migrate`. |
| Chat: "AWS rejected the credentials" | `aws login` again, then `npm run check:bedrock`. |
| Chat: "AWS denied model access" | Request that model under Bedrock → Model access, or pick another model. |
| Prices missing | Yahoo sometimes throttles; wait a minute and reload. |
| In PowerShell, a command containing `<url>` fails | `<` and `>` are placeholders: type the real value without them. |

## Where to read more

- [README.md](README.md): what Luna does and every configuration value.
- [docs/DEMO.md](docs/DEMO.md): the architecture and the demo script.
- [docs/DEPLOY.md](docs/DEPLOY.md): deploying to AWS.
- [docs/MCP.md](docs/MCP.md): using Luna's data from Claude Desktop, Cursor
  and other agents.
- [docs/HANDOFF.md](docs/HANDOFF.md): project history, current state and
  roadmap.
