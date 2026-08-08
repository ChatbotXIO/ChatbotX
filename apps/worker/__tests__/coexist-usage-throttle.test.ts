import { describe, expect, it } from "vitest"
import { resolveUsageThrottle } from "../src/integration/handlers/coexist/usage-throttle"

describe("resolveUsageThrottle", () => {
  it("keeps default concurrency when usage is absent or low", () => {
    expect(
      resolveUsageThrottle({
        signal: null,
        defaultConcurrency: 3,
        maxPauseMs: 45_000,
      }),
    ).toEqual({ concurrency: 3, pauseMs: 0 })

    expect(
      resolveUsageThrottle({
        signal: { kind: "meta-app-usage", callCount: 20 },
        defaultConcurrency: 3,
        maxPauseMs: 45_000,
      }),
    ).toEqual({ concurrency: 3, pauseMs: 0 })
  })

  it("reduces concurrency as app usage approaches exhaustion", () => {
    expect(
      resolveUsageThrottle({
        signal: { kind: "meta-app-usage", callCount: 72 },
        defaultConcurrency: 5,
        maxPauseMs: 45_000,
      }),
    ).toEqual({ concurrency: 3, pauseMs: 0 })

    expect(
      resolveUsageThrottle({
        signal: { kind: "meta-app-usage", totalTime: 80 },
        defaultConcurrency: 5,
        maxPauseMs: 45_000,
      }),
    ).toEqual({ concurrency: 1, pauseMs: 0 })
  })

  it("pauses when usage is exhausted", () => {
    expect(
      resolveUsageThrottle({
        signal: { kind: "meta-app-usage", callCount: 95 },
        defaultConcurrency: 3,
        maxPauseMs: 45_000,
      }),
    ).toEqual({ concurrency: 0, pauseMs: 30_000 })
  })

  it("honors BUC regain access time with a max pause cap", () => {
    expect(
      resolveUsageThrottle({
        signal: {
          kind: "meta-business-use-case-usage",
          estimatedTimeToRegainAccess: 120,
        },
        defaultConcurrency: 5,
        maxPauseMs: 45_000,
      }),
    ).toEqual({ concurrency: 0, pauseMs: 45_000 })
  })
})
