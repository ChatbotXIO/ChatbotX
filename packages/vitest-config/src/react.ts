import { fileURLToPath } from "node:url"
import nodeConfig from "@chatbotx.io/vitest-config/node"
import react from "@vitejs/plugin-react"
import { mergeConfig, type ViteUserConfig } from "vitest/config"

const setupDomPath = fileURLToPath(new URL("./setup-dom.ts", import.meta.url))

/**
 * Vitest preset for React libraries.
 *
 * Switches the environment to `jsdom` so React Testing Library and DOM APIs
 * work, and adds `@vitejs/plugin-react` for JSX transform.
 *
 * `setupFiles` is appended to the base preset's list (mergeConfig concatenates
 * arrays), so the node setup still runs first and `setup-dom` only fills the
 * DOM gaps jsdom leaves — `window.matchMedia` and `ResizeObserver` today.
 */
const config: ViteUserConfig = mergeConfig(nodeConfig, {
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [setupDomPath],
  },
})

export default config
