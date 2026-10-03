/// <reference path="./.sst/platform/config.d.ts" />

// Luna Terminal on AWS (SST v4). How to deploy: docs/DEPLOY.md. Why it looks
// like this: docs/BACKEND_PLAN.md.
//
//   CloudFront -> Lambda "Site" (Next.js via OpenNext, streaming)
//                   |-> Bedrock        hosted chat models (lib/hostedModels.mjs)
//                   |-> AgentCore      the chat's tool-using agent runtime      } infra/research.ts
//                   |-> S3 Vectors     uploaded-document search (Titan v2)    } (always on;
//                   |-> S3 Tables      research history via Athena            }  see
//                   |-> Lambda durable document extraction and reports       }  docs/AWS_AGENT_RESEARCH.md)
//                   |-> DynamoDB  LunaData   saved chats, shared rate limits   } only with
//                   |-> S3        LunaFiles  13F filing cache, avatars         } LUNA_DATA=true
//                   |-> Aurora DSQL LunaDb   accounts, watchlists, alerts, CRM }
//
// Everything reaches AWS through the Lambda's IAM role: no database password,
// no AI key, no AWS keys. Third-party API keys are SST secrets
// (`npx sst secret set <Name> <value> --stage <stage>`).
//
// The app and site names are the ones the AI preview was first deployed under;
// renaming either would create a second stack and a new CloudFront URL.

export default $config({
  app(input) {
    const production = input?.stage === "production";
    return {
      name: "luna-ai-preview",
      home: "aws",
      // Keep data when a production stage is removed; tear other stages down.
      removal: production ? "retain" : "remove",
      protect: production,
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    // `sst`, `aws` and `$util` are globals SST provides here. Importing them
    // from .sst/platform by path broke a fresh checkout: that folder is only
    // created by `sst install`, which itself has to read this file first.
    const production = $app.stage === "production";

    // ---- secrets -----------------------------------------------------------
    // Required. Signs Auth.js session cookies.
    const authSecret = new sst.Secret("AuthSecret");
    const geminiSecret = process.env.ENABLE_GEMINI === "true" ? new sst.Secret("GeminiApiKey") : null;
    // Optional feeds: an empty placeholder means "feature off" - the app treats
    // an empty variable the same as a missing one.
    const optional = (name: string) => new sst.Secret(name, "");
    const secrets = {
      ANTHROPIC_API_KEY: optional("AnthropicApiKey"),
      EXA_API_KEY: optional("ExaApiKey"),
      FINNHUB_API_KEY: optional("FinnhubApiKey"),
      TWELVEDATA_API_KEY: optional("TwelvedataApiKey"),
      ALPHAVANTAGE_API_KEY: optional("AlphavantageApiKey"),
      FMP_API_KEY: optional("FmpApiKey"),
      POLYGON_API_KEY: optional("PolygonApiKey"),
      TRADIER_API_TOKEN: optional("TradierApiToken"),
      AUTH_GOOGLE_ID: optional("AuthGoogleId"),
      AUTH_GOOGLE_SECRET: optional("AuthGoogleSecret"),
      AUTH_APPLE_ID: optional("AuthAppleId"),
      // A JWT from `npm run apple:secret`; Apple caps it at 6 months.
      AUTH_APPLE_SECRET: optional("AuthAppleSecret"),
      RESEND_API_KEY: optional("ResendApiKey"),
      CRON_SECRET: optional("CronSecret"),
      TURNSTILE_SECRET_KEY: optional("TurnstileSecretKey"),
      PRIVATE_PASSWORD: optional("PrivatePassword"),
      ANTHROPIC_WORKSPACE_ID: optional("AnthropicWorkspaceId"),
    };

    // ---- data (opt-in) -----------------------------------------------------
    // Off by default so an AI-preview deploy into a restricted workshop account
    // creates nothing beyond the site. LUNA_DATA=true adds the stores that
    // accounts, saved chats and shared rate limits need.
    const withData = process.env.LUNA_DATA === "true";
    const data = withData
      ? {
          // One table, many item types (PK/SK + GSI1). Items that should
          // expire set `expiresAt` (epoch seconds); DynamoDB deletes them.
          table: new sst.aws.Dynamo("LunaData", {
            fields: { PK: "string", SK: "string", GSI1PK: "string", GSI1SK: "string" },
            primaryIndex: { hashKey: "PK", rangeKey: "SK" },
            globalIndexes: { GSI1: { hashKey: "GSI1PK", rangeKey: "GSI1SK" } },
            ttl: "expiresAt",
            transform: {
              table: (args) => {
                args.pointInTimeRecovery = { enabled: production };
                args.deletionProtectionEnabled = production;
              },
            },
          }),
          files: new sst.aws.Bucket("LunaFiles"),
          // Serverless Postgres-compatible, IAM auth, no VPC. Schema:
          // `npm run db:migrate:dsql` (scripts/dsql-migrate.mjs).
          db: new sst.aws.Dsql("LunaDb", { backup: production }),
        }
      : null;

    // ---- models + research -------------------------------------------------
    // Exactly the hosted models in lib/hostedModels.mjs, nothing wider. The
    // AgentCore runtime and the research worker get the same set.
    const modelPermissions: any[] = [
      { actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-5",
        "arn:aws:bedrock:*::foundation-model/openai.gpt-5.6-sol",
        "arn:aws:bedrock:*:*:inference-profile/global.openai.gpt-5.6-sol",
        "arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-opus-5",
        "arn:aws:bedrock:*::foundation-model/meta.llama4-maverick-17b-instruct-v1:0",
        "arn:aws:bedrock:*:*:inference-profile/us.meta.llama4-maverick-17b-instruct-v1:0",
      ] },
      { actions: ["bedrock-mantle:CreateInference"], resources: ["arn:aws:bedrock-mantle:us-east-1:*:project/*"],
        conditions: [{ test: "StringEquals", variable: "bedrock-mantle:Model", values: ["google.gemma-4-31b", "qwen.qwen3-235b-a22b-2507"] }] },
    ];
    // Opt-in Bedrock Guardrail (LUNA_GUARDRAIL=true): declines personal buy/
    // sell/allocation advice and prompt attacks, for every model and for the
    // agent. Off by default; turn on after `npm run check:bedrock` passes
    // with BEDROCK_GUARDRAIL_ID set to the deployed guardrail.
    const policyEnvironment: Record<string, any> = {
      ...(process.env.BEDROCK_PROMPT_CACHE === "true" ? { BEDROCK_PROMPT_CACHE: "true" } : {}),
    };
    if (process.env.LUNA_GUARDRAIL === "true") {
      const declined = "I can't give personal buy, sell or allocation advice. I can show the data - prices, history, sentiment, filings - so you can decide.";
      const guardrail = new aws.bedrock.Guardrail("AdviceGuardrail", {
        name: `luna-advice-${$app.stage}`,
        blockedInputMessaging: declined,
        blockedOutputsMessaging: declined,
        topicPolicyConfig: {
          topicsConfigs: [{
            name: "personal_investment_advice",
            type: "DENY",
            definition: "Telling the user personally to buy, sell or hold a specific security, or how to allocate their own money, savings or retirement funds.",
            examples: ["Should I buy NVDA right now?", "How much of my savings should I put into Tesla?", "Tell me which stock to buy to double my money.", "Should I sell my 401k and buy bitcoin?"],
          }],
        },
        contentPolicyConfig: {
          filtersConfigs: [
            { type: "PROMPT_ATTACK", inputStrength: "HIGH", outputStrength: "NONE" },
            { type: "HATE", inputStrength: "MEDIUM", outputStrength: "MEDIUM" },
            { type: "INSULTS", inputStrength: "MEDIUM", outputStrength: "MEDIUM" },
            { type: "MISCONDUCT", inputStrength: "MEDIUM", outputStrength: "MEDIUM" },
          ],
        },
      });
      const version = new aws.bedrock.GuardrailVersion("AdviceGuardrailVersion", { guardrailArn: guardrail.guardrailArn, description: "Luna advice policy" });
      policyEnvironment.BEDROCK_GUARDRAIL_ID = guardrail.guardrailId;
      policyEnvironment.BEDROCK_GUARDRAIL_VERSION = version.version;
      modelPermissions.push({ actions: ["bedrock:ApplyGuardrail"], resources: [guardrail.guardrailArn] });
    }
    const { researchInfrastructure } = await import("./infra/research");
    const research = await researchInfrastructure(sst, modelPermissions, policyEnvironment);

    // ---- web ---------------------------------------------------------------
    const site = new sst.aws.Nextjs("Site", {
      buildCommand: "node scripts/build-aws.mjs",
      link: data ? [data.table, data.files, data.db] : [],
      environment: {
        AUTH_SECRET: authSecret.value,
        AUTH_TRUST_HOST: "true",
        ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL ?? "",
        // Public, inlined into the signup form at build time. Set it (and the
        // TurnstileSecretKey secret) only with a key whose allowed hostnames
        // include this stage's URL; unset means no bot check.
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY ?? "",
        ...research.environment,
        ...policyEnvironment,
        ...(geminiSecret ? { GEMINI_API_KEY: geminiSecret.value } : {}),
        ...(data
          ? {
              CHAT_TABLE: data.table.name,
              RATE_LIMIT_TABLE: data.table.name,
              DATA_BUCKET: data.files.name,
              DSQL_ENDPOINT: data.db.endpoint,
              DSQL_REGION: data.db.region,
            }
          : {}),
        ...Object.fromEntries(Object.entries(secrets).map(([key, secret]) => [key, secret.value])),
      },
      permissions: [...research.permissions, ...modelPermissions],
      server: { memory: "2048 MB", timeout: "120 seconds" },
      domain: process.env.LUNA_DOMAIN || undefined,
    });

    return {
      url: site.url,
      ...research.outputs,
      ...(data ? { table: data.table.name, bucket: data.files.name, dsql: data.db.endpoint } : {}),
    };
  },
});
