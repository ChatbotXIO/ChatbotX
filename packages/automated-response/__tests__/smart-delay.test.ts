import { SMART_RESPONSE_DELAY_OPTIONS } from "@chatbotx.io/database/partials"
import { describe, expect, test, vi } from "vitest"

vi.mock("../src/keys", () => ({
  env: {
    AUTOMATED_RESPONSE_DELAY_SECONDS: 2,
    AUTOMATED_RESPONSE_TTL_SECONDS: 2,
  },
}))

const { isSmartDelayEligible, resolveAutomatedResponseTiming } = await import(
  "../src/smart-delay"
)

describe("resolveAutomatedResponseTiming", () => {
  test("uses v1 env timing when workspace is null or undefined", () => {
    expect(resolveAutomatedResponseTiming(null)).toEqual({
      delaySeconds: 2,
      ttlSeconds: 2,
    })
    expect(resolveAutomatedResponseTiming(undefined)).toEqual({
      delaySeconds: 2,
      ttlSeconds: 2,
    })
  })

  test("uses each valid smart delay as both delay and dedup ttl", () => {
    for (const delaySeconds of SMART_RESPONSE_DELAY_OPTIONS) {
      expect(
        resolveAutomatedResponseTiming({
          smartResponseDelaySeconds: delaySeconds,
        }),
      ).toEqual({
        delaySeconds,
        ttlSeconds: delaySeconds,
      })
    }
  })

  test("falls back to env timing for unknown stored values", () => {
    for (const smartResponseDelaySeconds of [7, -1, 0]) {
      expect(
        resolveAutomatedResponseTiming({ smartResponseDelaySeconds }),
      ).toEqual({
        delaySeconds: 2,
        ttlSeconds: 2,
      })
    }
  })
})

describe("isSmartDelayEligible", () => {
  test("allows smart delay only for configured AI responses without keyword matches", () => {
    expect(
      isSmartDelayEligible({
        hasAiAgent: true,
        matchesKeyword: false,
        workspaceDelay: 30,
      }),
    ).toBe(true)
  })

  test("rejects when the workspace delay is not configured", () => {
    expect(
      isSmartDelayEligible({
        hasAiAgent: true,
        matchesKeyword: false,
        workspaceDelay: null,
      }),
    ).toBe(false)
  })

  test("rejects keyword-matched messages", () => {
    expect(
      isSmartDelayEligible({
        hasAiAgent: true,
        matchesKeyword: true,
        workspaceDelay: 30,
      }),
    ).toBe(false)
  })

  test("rejects workspaces without a default AI agent", () => {
    expect(
      isSmartDelayEligible({
        hasAiAgent: false,
        matchesKeyword: false,
        workspaceDelay: 30,
      }),
    ).toBe(false)
  })
})
