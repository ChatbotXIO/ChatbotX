import preset from "@chatbotx.io/vitest-config/node"
import { mergeConfig } from "vitest/config"

/**
 * DB-backed integration suite (`pnpm --filter worker test:db`). Every file under
 * `__tests__/integration/` runs real handlers and services against a throwaway
 * Postgres database that `global-setup.ts` creates, migrates from scratch and
 * drops, so it can never touch the developer's data.
 */
export default mergeConfig(preset, {
  test: {
    include: ["__tests__/integration/**/*.test.ts"],
    globalSetup: ["./__tests__/integration/global-setup.ts"],
    // One shared throwaway database: files run one after another. Each test
    // still seeds its own workspace, so tests never depend on each other.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
