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
    // On CI, turbo already parallelizes at the task level (many workspace
    // suites at once on a small runner). Left at the default, every vitest
    // process forks one worker per CPU, multiplying into dozens of node
    // processes fighting for 2-4 vCPUs — which is what pushes cold imports
    // past testTimeout. One worker per suite keeps total processes ≈ turbo
    // concurrency.
    ...(process.env.CI ? { maxWorkers: 1 } : {}),
    // `turbo run test` executes every workspace's suite concurrently, so a
    // test's first module-graph import can take well over vitest's 5s default
    // on a loaded machine (and CI runners). A timed-out test also poisons the
    // next one in its file: the abandoned call resolves late and increments
    // shared mocks. Generous timeouts only delay true hangs.
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
