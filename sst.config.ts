/// <reference path="./.sst/platform/config.d.ts" />

// Luna Terminal on AWS. See docs/BACKEND_PLAN.md for the why; docs/DEPLOY.md
// for how to run it.
//
//   CloudFront -> Lambda (Next.js via OpenNext)
//                   |-> DynamoDB  LunaData   chats now; rate limits, caches, game rooms next
//                   |-> S3        LunaFiles  parsed 13F filings, avatars, exports
//                   |-> Aurora DSQL LunaDb   accounts, watchlists, alerts, CRM
//
// Every link grants the Lambda IAM access to that resource, so production has
// no database password and no AWS keys - only third-party API keys, which are
// SST secrets (`npx sst secret set <Name> <value> --stage <stage>`).

export default $config({
  app(input) {
    const production = input?.stage === "production";
    return {
      name: "luna-terminal",
      home: "aws",
      // Keep data when a production stage is removed; tear dev stages down fully.
      removal: production ? "retain" : "remove",
      protect: production,
      providers: { aws: { region: "us-east-1" } },
    };
  },

  async run() {
    const production = $app.stage === "production";

    // ---- secrets -----------------------------------------------------------
    // Required. Signs Auth.js session cookies.
    const authSecret = new sst.Secret("AuthSecret");
    // Optional: an empty placeholder means "feature off" - the app already
    // treats an empty variable the same as a missing one.
    const optional = (name: string) => new sst.Secret(name, "");
    const secrets = {
      ANTHROPIC_API_KEY: optional("AnthropicApiKey"),
      ANTHROPIC_WORKSPACE_ID: optional("AnthropicWorkspaceId"),
      EXA_API_KEY: optional("ExaApiKey"),
      FINNHUB_API_KEY: optional("FinnhubApiKey"),
      TWELVEDATA_API_KEY: optional("TwelvedataApiKey"),
      ALPHAVANTAGE_API_KEY: optional("AlphavantageApiKey"),
      FMP_API_KEY: optional("FmpApiKey"),
      POLYGON_API_KEY: optional("PolygonApiKey"),
      TRADIER_API_TOKEN: optional("TradierApiToken"),
      AUTH_GOOGLE_ID: optional("AuthGoogleId"),
      AUTH_GOOGLE_SECRET: optional("AuthGoogleSecret"),
      RESEND_API_KEY: optional("ResendApiKey"),
      CRON_SECRET: optional("CronSecret"),
      TURNSTILE_SECRET_KEY: optional("TurnstileSecretKey"),
      PRIVATE_PASSWORD: optional("PrivatePassword"),
    };

    // ---- data --------------------------------------------------------------
    // One table, many item types, keyed PK/SK with one GSI. Chat layout is in
    // lib/chatRepository.mjs; items that should expire set `expiresAt`
    // (epoch seconds) and DynamoDB deletes them for free.
    const table = new sst.aws.Dynamo("LunaData", {
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
    });

    const files = new sst.aws.Bucket("LunaFiles");

    // Serverless Postgres-compatible, IAM auth, no VPC. Schema is applied with
    // scripts/dsql-migrate.mjs (one DDL statement per transaction).
    const db = new sst.aws.Dsql("LunaDb", { backup: production });

    // ---- web ---------------------------------------------------------------
    const web = new sst.aws.Nextjs("LunaWeb", {
      link: [table, files, db],
      environment: {
        CHAT_TABLE: table.name,
        DATA_BUCKET: files.name,
        DSQL_ENDPOINT: db.endpoint,
        DSQL_REGION: db.region,
        AUTH_SECRET: authSecret.value,
        ALERT_FROM_EMAIL: process.env.ALERT_FROM_EMAIL ?? "",
        ...Object.fromEntries(Object.entries(secrets).map(([key, secret]) => [key, secret.value])),
      },
      domain: process.env.LUNA_DOMAIN || undefined,
    });

    return {
      url: web.url,
      table: table.name,
      bucket: files.name,
      dsql: db.endpoint,
    };
  },
});
