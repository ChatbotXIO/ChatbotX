import { mergeConfig, type ViteUserConfig } from "vitest/config"
import preset, { mswSetupFiles } from "./src/node.ts"

/**
 * MSW is opt-in (see `./src/node.ts`) — this package's own tests exercise the
 * MSW server lifecycle, so it re-adds the setup file on top of the preset.
 */
const config: ViteUserConfig = mergeConfig(preset, {
  test: {
    setupFiles: [...mswSetupFiles],
  },
})

export default config
