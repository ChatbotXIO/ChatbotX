import { defineConfig } from "vitest/config"

/**
 * Root Vitest config. Aggregates every workspace's `vitest.config.ts` via the
 * `projects` field so that `pnpm test` at the root runs the full suite.
 *
 * Per-workspace runs still work: `pnpm --filter <name> test`.
 */
export default defineConfig({
  test: {
    projects: [
      "apps/*/vitest.config.ts",
      "packages/*/vitest.config.ts",
      "integrations/*/vitest.config.ts",
    ],
  },
})
