import { fileURLToPath } from "node:url"
import preset from "@chatbotx.io/vitest-config/nextjs"
import { mergeConfig } from "vitest/config"

const setupAuthPath = fileURLToPath(
  new URL("./__tests__/setup-auth.ts", import.meta.url),
)

export default mergeConfig(preset, {
  test: {
    setupFiles: [setupAuthPath],
  },
})
