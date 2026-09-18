import preset from "@chatbotx.io/vitest-config/node"
import { mergeConfig, type ViteUserConfig } from "vitest/config"

/**
 * Type-level regression coverage (P5 review A3): `__tests__/*.test-d.ts`
 * files (e.g. `whatsapp-call-outcome.test-d.ts`) hold `expectTypeOf`
 * assertions that only mean anything under a real type-checker — plain
 * `vitest run` never invokes `tsc` on them, so a regression there was
 * previously silent. Scoped to THIS workspace's config (rather than the
 * shared `@chatbotx.io/vitest-config/node` preset every Node workspace
 * imports) to avoid adding `tsc` overhead to every other package's
 * `pnpm test` for a pattern only this workspace currently uses.
 */
const config: ViteUserConfig = mergeConfig(preset, {
  test: {
    typecheck: {
      enabled: true,
      include: ["**/*.test-d.ts"],
      // `tsconfig.json`'s own `include` is scoped to `src/**` + `scripts/**`
      // only (see `check-types`) — a plain `tsc -p tsconfig.json` never
      // compiles anything under `__tests__/`, so vitest's tsc-based checker
      // would silently report zero diagnostics for every `.test-d.ts` file
      // (verified: reverting to `tsconfig.json` here makes a deliberately
      // broken type in `partials/whatsapp-call.ts` pass typecheck with no
      // errors). This dedicated config adds `__tests__/**/*.test-d.ts` to
      // the compiled set without touching `check-types`'s own scope.
      tsconfig: "./tsconfig.typecheck.json",
    },
  },
})

export default config
