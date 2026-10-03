import type { OpenNextConfig } from "@opennextjs/aws/types/open-next";

export default {
  default: { override: { wrapper: "aws-lambda-streaming" } },
} satisfies OpenNextConfig;
