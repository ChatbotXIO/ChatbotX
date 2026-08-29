import { fileURLToPath } from "node:url"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig, type ViteUserConfig } from "vitest/config"

const COVERAGE_THRESHOLD = 80

/**
 * Opt-in MSW lifecycle, for workspaces whose tests mock upstream HTTP.
 *
 * Spread into a suite's own `setupFiles` alongside the preset's defaults:
 *
 *     import preset, { mswSetupFiles } from "@chatbotx.io/vitest-config/node"
 *     import { mergeConfig } from "vitest/config"
 *
 *     export default mergeConfig(preset, {
 *       test: { setupFiles: [...mswSetupFiles] },
 *     })
 *
 * Vitest merges `setupFiles` arrays, so this appends to the preset's list
 * rather than replacing it.
 */
export const mswSetupFiles: readonly string[] = [
  fileURLToPath(new URL("./setup-msw.ts", import.meta.url)),
]

const setupEnvPath = fileURLToPath(new URL("./setup-env.ts", import.meta.url))

/** Workers per suite on CI. See the `resolveWorkerPool` doc comment. */
const CI_MAX_WORKERS = 4

/**
 * Worker sizing. `turbo run test --concurrency=N` runs N workspace suites at
 * once, but turbo does NOT parallelize *within* a suite: each suite is one
 * `vitest run` process, so wall clock is bounded below by the slowest single
 * suite (builder: 248 files). Task-level concurrency therefore cannot shorten
 * the critical path — only vitest's own workers can.
 *
 * Budget: keep (turbo concurrency x maxWorkers) <= vCPU count so workers never
 * oversubscribe. Tests now own a dedicated 4-vCPU job (see ci.yml), so the
 * whole box goes to one suite at a time: `--concurrency=1` x 4 workers.
 *
 * Measured on builder (248 files, CI env, cold): forks/2w 71.9s (the previous
 * setting), threads/2w 66.6s, threads/3w 47.5s, threads/4w 42.3s — all 248
 * files green. Set `VITEST_MAX_WORKERS` to experiment without editing this
 * preset — it is declared in the root turbo.json `passThroughEnv` so it
 * survives turbo's strict env mode.
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
    // `setup-env` only — it is a dependency-free object literal, and packages
    // here read env at module load, so every suite needs it.
    //
    // MSW is deliberately NOT global. Booting `setupServer()` costs a ~7MB
    // module graph plus three lifecycle hooks in EVERY test file, while only
    // 24 files across 7 workspaces actually mock HTTP (0 of builder's 248).
    // Those workspaces opt in via `msw-setup-files` below.
    //
    // Trade-off: suites without MSW lose its `onUnhandledRequest: "error"`
    // net, which failed tests that made real network calls. `setup-env.ts`
    // still points DATABASE_URL/REDIS_URL/S3_ENDPOINT at non-routable
    // 127.0.0.1:1, so an accidental connection fails fast rather than
    // reaching a real host.
    setupFiles: [setupEnvPath],
    clearMocks: true,
    restoreMocks: true,
    // `threads` starts workers materially cheaper than the default `forks`
    // (measured on builder: 71.9s -> 66.6s at equal worker count, and it
    // scales better, reaching 42.3s at 4 workers).
    //
    // `isolate` stays TRUE deliberately. Turning it off is much faster
    // (~30s on builder) but breaks the suite: `vi.mock` registers per module
    // registry, so files sharing a worker overwrite each other's mocks.
    // Measured on this repo, `--no-isolate` failed 18 files / 22 tests on
    // threads and 2 files / 9 tests on forks, with the failing set changing
    // between runs; each of those files passes when run alone. That is
    // pre-existing latent cross-file coupling, not a bug isolation should be
    // hiding — do not disable isolation without first decoupling those tests.
    pool: "threads",
    ...resolveWorkerPool(),
    // Pre-bundle the external module graph once with esbuild instead of
    // re-resolving it per test file. Import — not test execution — dominates
    // this repo's suites (builder measured `import 419.94s` vs `tests
    // 16.92s`), because every workspace package resolves to raw `src/*.ts`,
    // so the drizzle/zod/schema graph is re-transformed for each file.
    // This changes no test-isolation semantics.
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
        },
      },
    },
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
