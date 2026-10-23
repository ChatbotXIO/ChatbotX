import preset from "@chatbotx.io/vitest-config/node"
import { mergeConfig } from "vitest/config"

// The DB-backed suite under `__tests__/integration/` needs a throwaway
// database and runs through `pnpm test:db` (vitest.integration.config.ts).
export default mergeConfig(preset, {
  test: { exclude: ["**/__tests__/integration/**"] },
})
