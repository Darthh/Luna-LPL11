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
    const geminiSecret = process.env.ENABLE_GEMINI === "true" ? new sst.Secret("GeminiApiKey") : null;
    const modelPermissions = [
      { actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"], resources: [
        "arn:aws:bedrock:*::foundation-model/anthropic.claude-opus-5", "arn:aws:bedrock:*::foundation-model/openai.gpt-5.6-sol",
        "arn:aws:bedrock:*:*:inference-profile/global.openai.gpt-5.6-sol", "arn:aws:bedrock:*:*:inference-profile/global.anthropic.claude-opus-5",
        "arn:aws:bedrock:*::foundation-model/meta.llama4-maverick-17b-instruct-v1:0", "arn:aws:bedrock:*:*:inference-profile/us.meta.llama4-maverick-17b-instruct-v1:0",
      ] },
      { actions: ["bedrock-mantle:CreateInference"], resources: ["arn:aws:bedrock-mantle:us-east-1:*:project/*"],
        conditions: [{ test: "StringEquals", variable: "bedrock-mantle:Model", values: ["google.gemma-4-31b", "qwen.qwen3-235b-a22b-2507"] }] },
    ];
    const { researchInfrastructure } = await import("./infra/research");
    const research = await researchInfrastructure(sst, modelPermissions);
    const site = new sst.aws.Nextjs("Site", {
      buildCommand: "node scripts/build-aws.mjs",
      environment: { AUTH_SECRET: authSecret.value, AUTH_TRUST_HOST: "true", ...research.environment,
        ...(geminiSecret ? { GEMINI_API_KEY: geminiSecret.value } : {}) },
      permissions: [...research.permissions,
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
      ],
      server: { memory: "2048 MB", timeout: "120 seconds" },
    });
    return { url: site.url, ...research.outputs };
  },
});
