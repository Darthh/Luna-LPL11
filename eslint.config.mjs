import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated: OpenNext's Lambda bundle, SST's platform code, Prisma client.
    ".open-next/**",
    ".sst/**",
    "lib/generated/**",
  ]),
]);

export default eslintConfig;
