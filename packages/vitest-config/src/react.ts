import nodeConfig from "@chatbotx.io/vitest-config/node"
import react from "@vitejs/plugin-react"
import { mergeConfig, type ViteUserConfig } from "vitest/config"

/**
 * Vitest preset for React libraries.
 *
 * Switches the environment to `jsdom` so React Testing Library and DOM APIs
 * work, and adds `@vitejs/plugin-react` for JSX transform.
 */
const config: ViteUserConfig = mergeConfig(nodeConfig, {
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
})

export default config
