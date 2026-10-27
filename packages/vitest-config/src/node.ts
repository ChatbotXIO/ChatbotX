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

/**
 * External packages pre-bundled for every suite. See `deps.optimizer` below.
 *
 * `vi.mock(pkg, importOriginal)` works on these (fixed in vitest 4.1.9). A
 * plain factory mock of a CommonJS package (`bullmq`) does not: the bundled
 * module is imported through `default`, which the factory never returns. A
 * suite that factory-mocks one opts it out in its own config with
 * `deps.optimizer.ssr.exclude` (apps/worker, packages/worker-config).
 */
const OPTIMIZED_DEPENDENCIES: readonly string[] = [
  "drizzle-orm",
  "drizzle-orm/pg-core",
  "drizzle-orm/node-postgres",
  "drizzle-orm/errors",
  "drizzle-orm/zod",
  "zod",
  "@aws-sdk/client-s3",
  "ioredis",
  "bullmq",
  "date-fns",
  "date-fns-tz",
]

/** Workers per suite on CI. See the `resolveWorkerPool` doc comment. */
const CI_MAX_WORKERS = 4

/**
 * Worker sizing. `turbo run test --concurrency=N` runs N workspace suites at
 * once, but turbo does NOT parallelize *within* a suite: each suite is one
 * `vitest run` process, so wall clock is bounded below by the slowest single
 * suite (builder: 248 files). Task-level concurrency therefore cannot shorten
 * the critical path — only vitest's own workers can.
 *
 * Budget: each CI test shard is a 4-vCPU runner running `--concurrency=2`
 * (see ci.yml), so two suites x 4 workers overlap on purpose: the many small
 * suites fill the gaps while the large ones keep their workers busy.
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
    // Pre-bundle the heaviest external packages once with esbuild, so each
    // isolated test file loads one prebuilt module per package instead of
    // walking hundreds of `node_modules` files. Import — not test execution —
    // dominates this repo's suites. Measured locally with 2 workers:
    // business 160s -> 53s, builder 385s -> 250s, worker 136s -> 95s.
    //
    // Vitest's optimizer has no auto-discovery (`noDiscovery: true`), so an
    // empty `include` bundles nothing: the list below is what does the work.
    // List every subpath a test or source file imports (`drizzle-orm/errors`
    // …) — a subpath left out loads a second copy, and its classes then fail
    // `instanceof` against the bundled one (`DrizzleQueryError`). jsdom suites
    // (builder) use the `client` optimizer, node suites `ssr`.
    deps: {
      optimizer: {
        ssr: { enabled: true, include: [...OPTIMIZED_DEPENDENCIES] },
        client: { enabled: true, include: [...OPTIMIZED_DEPENDENCIES] },
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
