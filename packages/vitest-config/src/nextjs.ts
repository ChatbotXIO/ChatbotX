import { mergeConfig, type ViteUserConfig } from "vitest/config"
import reactConfig from "./react"

/**
 * Vitest preset for the Next.js builder app.
 *
 * Extends the React preset with conditions/aliases that align with how Next.js
 * resolves modules in dev. Tests for pure server-only code (e.g. server
 * actions, route handlers) should add `// @vitest-environment node` at the top
 * of the file to opt out of jsdom for that file.
 */
const config: ViteUserConfig = mergeConfig(reactConfig, {
  resolve: {
    conditions: ["browser", "module", "import", "default"],
  },
  test: {
    server: {
      deps: {
        inline: [/^next-intl/],
      },
    },
  },
})

export default config
