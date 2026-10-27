import preset from "@chatbotx.io/vitest-config/node"
import { mergeConfig } from "vitest/config"

// `bullmq` is mocked with plain factories here, so it stays out of the
// preset's dependency pre-bundling (see apps/worker/vitest.config.ts).
export default mergeConfig(preset, {
  test: { deps: { optimizer: { ssr: { exclude: ["bullmq"] } } } },
})
