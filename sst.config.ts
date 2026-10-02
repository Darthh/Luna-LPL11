/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return { name: "luna-ai-preview", home: "aws", removal: "remove", providers: { aws: { region: "us-east-1" } } };
  },
  async run() {
    const sst = await import("./.sst/platform/src/components/index.js");
    // Preview hosting uses Lambda IAM, never the workshop session credentials.
    // Account persistence is deliberately not provisioned by this AI preview.
    const authSecret = new sst.Secret("AuthSecret");
    const site = new sst.aws.Nextjs("Site", {
      buildCommand: "node scripts/build-aws.mjs",
      environment: { AUTH_SECRET: authSecret.value, AUTH_TRUST_HOST: "true", BEDROCK_REGION: "us-east-1" },
      permissions: [
        { actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
          "arn:aws:bedrock:us-east-1:*:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0",
        ] },
        { actions: ["bedrock-mantle:CreateInference"], resources: ["arn:aws:bedrock-mantle:us-east-1:*:project/*"],
          conditions: [{ test: "StringEquals", variable: "bedrock-mantle:Model", values: ["openai.gpt-5.4"] }] },
      ],
      server: { memory: "2048 MB", timeout: "120 seconds" },
    });
    return { url: site.url };
  },
});
