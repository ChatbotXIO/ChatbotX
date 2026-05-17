import { fileURLToPath } from "node:url"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig, type ViteUserConfig } from "vitest/config"

const COVERAGE_THRESHOLD = 80

const setupEnvPath = fileURLToPath(new URL("./setup-env.ts", import.meta.url))
const setupMswPath = fileURLToPath(new URL("./setup-msw.ts", import.meta.url))

/**
 * Base Vitest preset for Node.js workspaces (libraries, workers, CLIs).
 *
 * Workspaces consume this via:
 *
 *     import preset from "@chatbotx.io/vitest-config/node"
 *     export default preset
 *
 * To extend, callers can `mergeConfig(preset, defineConfig({...}))`.
 */
const config: ViteUserConfig = defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
    ],
    setupFiles: [setupEnvPath, setupMswPath],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "**/__tests__/**",
        "**/dist/**",
      ],
      thresholds: process.env.VITEST_SKIP_COVERAGE_THRESHOLDS
        ? undefined
        : {
            lines: COVERAGE_THRESHOLD,
            functions: COVERAGE_THRESHOLD,
            branches: COVERAGE_THRESHOLD,
            statements: COVERAGE_THRESHOLD,
          },
    },
  },
})

export default config
