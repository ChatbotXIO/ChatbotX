import preset from "@chatbotx.io/vitest-config/node"
import { mergeConfig, type ViteUserConfig } from "vitest/config"

/**
 * `__tests__/*.test-d.ts` expectTypeOf assertions only mean anything under a
 * real type-checker — plain vitest run never invokes tsc on them. Scoped to
 * this package only, to avoid tsc overhead in every other package's test run.
 */
const config: ViteUserConfig = mergeConfig(preset, {
  test: {
    typecheck: {
      enabled: true,
      include: ["**/*.test-d.ts"],
      // tsconfig.json only includes src/**+scripts/**, so vitest's tsc-based
      // checker would silently report zero diagnostics for __tests__/*.test-d.ts
      // under it. This dedicated tsconfig adds that path without touching
      // check-types's own scope.
      tsconfig: "./tsconfig.typecheck.json",
    },
  },
})

export default config
