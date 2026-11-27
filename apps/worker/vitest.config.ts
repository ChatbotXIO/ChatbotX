import preset from "@chatbotx.io/vitest-config/node"
import { mergeConfig } from "vitest/config"

// The DB-backed suite under `__tests__/integration/` needs a throwaway
// database and runs through `pnpm test:db` (vitest.integration.config.ts).
//
// `bullmq` is mocked with plain factories here (`Worker`, `QueueEvents`), so
// it must stay out of the preset's dependency pre-bundling: a pre-bundled CJS
// module is imported through its `default` export, which those factories do
// not return.
export default mergeConfig(preset, {
  test: {
    exclude: ["**/__tests__/integration/**"],
    deps: { optimizer: { ssr: { exclude: ["bullmq"] } } },
  },
})
