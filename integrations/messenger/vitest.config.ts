import preset, { mswSetupFiles } from "@chatbotx.io/vitest-config/node"
import { mergeConfig, type ViteUserConfig } from "vitest/config"

/**
 * MSW is opt-in (see `vitest-config/src/node.ts`) — this workspace mocks
 * upstream HTTP, so it re-adds the server lifecycle on top of the preset.
 */
const config: ViteUserConfig = mergeConfig(preset, {
  test: {
    setupFiles: [...mswSetupFiles],
  },
})

export default config
