# Deploying Luna Terminal to AWS

Infrastructure is code in [`sst.config.ts`](../sst.config.ts) (SST v4). One
command creates or updates a whole **stage**: an isolated copy of the stack.
Use one stage per developer (e.g. `alice`), plus `staging` and `production`.

| Resource | SST component | What it holds |
|---|---|---|
| `LunaWeb` | `sst.aws.Nextjs` | The app: CloudFront → Lambda (OpenNext), static assets in S3 |
| `LunaData` | `sst.aws.Dynamo` | Saved chats (more item types to come; see `docs/BACKEND_PLAN.md` §5.2) |
| `LunaFiles` | `sst.aws.Bucket` | 13F filing cache, avatars, exports (wired up in Phase 3) |
| `LunaDb` | `sst.aws.Dsql` | Accounts, watchlists, alerts, CRM (Aurora DSQL, IAM auth) |

Each resource is **linked** to the web function, so the Lambda gets IAM access
to it and nothing needs a password. The app learns names and endpoints from
environment variables set in `sst.config.ts` (`CHAT_TABLE`, `DATA_BUCKET`,
`DSQL_ENDPOINT`, `DSQL_REGION`); app code doesn't import SST.

## 1. One-time AWS setup

You need an AWS account and the AWS CLI signed in as an administrator
(`aws sts get-caller-identity` should work).

### Deploy from your machine

```bash
npm ci
npx sst secret set AuthSecret "$(openssl rand -base64 32)" --stage <you>
npx sst deploy --stage <you>        # prints the CloudFront URL
```

Optional features turn on when you set their secret. These are the same keys as
`.env.local.example`:

```bash
npx sst secret set FinnhubApiKey   <value> --stage <you>
npx sst secret set AnthropicApiKey <value> --stage <you>
# ExaApiKey, TwelvedataApiKey, AlphavantageApiKey, FmpApiKey, PolygonApiKey,
# TradierApiToken, AuthGoogleId, AuthGoogleSecret, ResendApiKey, CronSecret,
# TurnstileSecretKey, PrivatePassword, AnthropicWorkspaceId
npx sst secret list --stage <you>
```

Changing a secret takes effect on the next `sst deploy`.

To remove a dev stage: `npx sst remove --stage <you>`. The `production` stage
is protected: its resources are retained, and the table has deletion
protection and point-in-time recovery.

### Deploy from GitHub Actions (OIDC, no stored keys)

`.github/workflows/deploy.yml` deploys `main` → `staging` and tags `v*` →
`production`, and can also be run by hand for any stage. It stays skipped
until you set it up:

1. **Create the GitHub OIDC provider** in IAM (once per account):
   ```bash
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com
   ```
2. **Create a deploy role** that only this repository can assume:
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
   SST creates IAM roles, CloudFront distributions and more, so start with
   admin. Narrow the policy once the resource set is stable (Phase 6).
3. In GitHub, go to **Settings → Secrets and variables → Actions → Variables**
   and add `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::<account>:role/luna-github-deploy`.
   Optional variables: `ALERT_FROM_EMAIL` and `LUNA_DOMAIN` (a custom domain
   hosted in Route 53).
4. Create GitHub **environments** named `staging` and `production`. Add
   required reviewers to `production` if you want a manual gate.
5. Set the stage secrets once from your machine, as above, using
   `--stage staging` and `--stage production`.

## 2. Database schema (Aurora DSQL)

The cluster is created empty. **Phase 3** of the plan adds
`scripts/dsql-migrate.mjs`, which applies `migrations/*.sql` one statement per
transaction (a DSQL rule). Until then, account features fail on a fresh stage:
sign-in, watchlist, alerts and CRM. This includes saving chats, because that
needs a signed-in user. Public research pages and the AI chat work without it.

## 3. Local development

Nothing changes: `npm run dev` with `.env.local` uses a local Postgres
`DATABASE_URL` and an in-memory chat store. To develop against real AWS
resources, `npx sst dev --stage <you>` runs `next dev` with the stage's linked
resources and environment.

## 4. What runs where

| Concern | Local (`npm run dev`) | AWS stage |
|---|---|---|
| Accounts DB | `DATABASE_URL` (Postgres) | Aurora DSQL via IAM token (`lib/prisma.js`) |
| Chat history | In-memory (lost on restart) | DynamoDB `LunaData` |
| Secrets | `.env.local` | `sst secret` (SSM), injected as env vars |
| AI | `ANTHROPIC_API_KEY` or keyless | Same today; Bedrock via IAM in Phase 4 |

## 5. Checks before a deploy

```bash
npm run lint && npm test && npm run build
```

CI (`.github/workflows/web-ci.yml`) runs the same checks on every PR.
