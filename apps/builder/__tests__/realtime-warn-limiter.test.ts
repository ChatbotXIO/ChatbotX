import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  decideRealtimeWarnLogging,
  resetRealtimeWarnLimiterForTests,
} from "@/features/realtime/realtime-warn-limiter"

describe("decideRealtimeWarnLogging", () => {
  beforeEach(() => {
    resetRealtimeWarnLimiterForTests()
  })

  test("logs normally for the first N occurrences in a window", () => {
    for (let i = 0; i < 5; i++) {
      expect(decideRealtimeWarnLogging("malformed-json", undefined, 0)).toEqual(
        { shouldLog: true, isSuppressionSummary: false },
      )
    }
  })

  test("logs exactly one suppression summary once the limit is exceeded", () => {
    for (let i = 0; i < 5; i++) {
      decideRealtimeWarnLogging("malformed-json", undefined, 0)
    }
    expect(decideRealtimeWarnLogging("malformed-json", undefined, 0)).toEqual({
      shouldLog: true,
      isSuppressionSummary: true,
    })
  })

  test("suppresses every occurrence after the summary within the same window", () => {
    for (let i = 0; i < 6; i++) {
      decideRealtimeWarnLogging("malformed-json", undefined, 0)
    }
    expect(decideRealtimeWarnLogging("malformed-json", undefined, 10)).toEqual({
      shouldLog: false,
    })
    expect(
      decideRealtimeWarnLogging("malformed-json", undefined, 59_000),
    ).toEqual({ shouldLog: false })
  })

  test("recovers (logs normally again) once the window elapses", () => {
    for (let i = 0; i < 6; i++) {
      decideRealtimeWarnLogging("malformed-json", undefined, 0)
    }
    expect(
      decideRealtimeWarnLogging("malformed-json", undefined, 60_000),
    ).toEqual({ shouldLog: true, isSuppressionSummary: false })
  })

  test("keys by reason + eventType independently — a burst on one event never suppresses another", () => {
    for (let i = 0; i < 6; i++) {
      decideRealtimeWarnLogging(
        "schema-invalid",
        "whatsappCallTransportIncoming",
        0,
      )
    }
    expect(
      decideRealtimeWarnLogging(
        "schema-invalid",
        "whatsappCallTransportIncoming",
        0,
      ),
    ).toEqual({ shouldLog: false })
    expect(
      decideRealtimeWarnLogging(
        "schema-invalid",
        "whatsappCallOutboundStatus",
        0,
      ),
    ).toEqual({ shouldLog: true, isSuppressionSummary: false })
  })

  test("with the system clock (fake timers): suppresses then recovers after the real window elapses", () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(0)
      for (let i = 0; i < 6; i++) {
        decideRealtimeWarnLogging("malformed-json", undefined)
      }
      expect(decideRealtimeWarnLogging("malformed-json", undefined)).toEqual({
        shouldLog: false,
      })

      vi.advanceTimersByTime(60_000)

      expect(decideRealtimeWarnLogging("malformed-json", undefined)).toEqual({
        shouldLog: true,
        isSuppressionSummary: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test("a reason with no eventType is keyed independently from the same reason with one", () => {
    for (let i = 0; i < 6; i++) {
      decideRealtimeWarnLogging("malformed-json", undefined, 0)
    }
    expect(
      decideRealtimeWarnLogging("malformed-json", "messageDeleted", 0),
    ).toEqual({ shouldLog: true, isSuppressionSummary: false })
  })
})
