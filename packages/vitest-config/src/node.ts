import { fileURLToPath } from "node:url"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig, type ViteUserConfig } from "vitest/config"

const COVERAGE_THRESHOLD = 80

const setupEnvPath = fileURLToPath(new URL("./setup-env.ts", import.meta.url))
const setupMswPath = fileURLToPath(new URL("./setup-msw.ts", import.meta.url))

/** Workers per suite on CI. See the `resolveWorkerPool` doc comment. */
const CI_MAX_WORKERS = 2

/**
 * Worker sizing. `turbo run test --concurrency=N` runs N workspace suites at
 * once, but turbo does NOT parallelize *within* a suite: each suite is one
 * `vitest run` process, so wall clock is bounded below by the slowest single
 * suite (builder: 248 files). Task-level concurrency therefore cannot shorten
 * the critical path — only vitest's own workers can.
 *
 * Budget: keep (turbo concurrency x maxWorkers) <= vCPU count so forks never
 * oversubscribe. CI runs `--concurrency=2` on 4-vCPU runners, so 2 workers per
 * suite fills the box exactly. Locally, leave vitest's default (one worker per
 * CPU) alone.
 *
 * Measured on builder (248 files, through `turbo run test`): 1 worker 147s,
 * 2 workers 76s, 4 workers 41s. Set `VITEST_MAX_WORKERS` to experiment without
 * editing this preset — it is declared in the root turbo.json `passThroughEnv`
 * so it survives turbo's strict env mode.
 */
function resolveWorkerPool(): { maxWorkers?: number; minWorkers?: number } {
  const override = Number(process.env.VITEST_MAX_WORKERS)

  if (Number.isInteger(override) && override > 0) {
    return { maxWorkers: override, minWorkers: 1 }
  }

  if (process.env.CI) {
    return { maxWorkers: CI_MAX_WORKERS, minWorkers: 1 }
  }

  return {}
}

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
    ...resolveWorkerPool(),
    // Several suites run at once (turbo) and several files within each (above),
    // so a test's first module-graph import can take well over vitest's 5s
    // default on a loaded machine (and CI runners). A timed-out test also
    // poisons the next one in its file: the abandoned call resolves late and
    // increments shared mocks. Generous timeouts only delay true hangs.
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
