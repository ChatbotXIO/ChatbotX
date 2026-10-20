import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const loggerInfo = vi.hoisted(() => vi.fn())

vi.mock("../src/logger", () => ({ logger: { info: loggerInfo } }))

import {
  flushRealtimeRelayMetrics,
  recordRealtimeRelayBackpressure,
  recordRealtimeRelayEvent,
  resetRealtimeRelayMetricsForTests,
} from "../src/platform/realtime-relay-metrics"

beforeEach(() => {
  loggerInfo.mockReset()
  resetRealtimeRelayMetricsForTests()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("realtime relay metrics", () => {
  test("flushes only after its time window unless forced, then resets", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    resetRealtimeRelayMetricsForTests()
    recordRealtimeRelayEvent("typing", 12)

    flushRealtimeRelayMetrics(false)
    expect(loggerInfo).not.toHaveBeenCalled()

    vi.advanceTimersByTime(10_000)
    flushRealtimeRelayMetrics(false)
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: 12,
        events: 1,
        metric: "realtime_relay",
      }),
      "realtime_relay_metric",
    )

    flushRealtimeRelayMetrics(true)
    expect(loggerInfo).toHaveBeenCalledTimes(1)
  })

  test("logs backpressure once per metrics window", () => {
    expect(recordRealtimeRelayBackpressure()).toBe(true)
    expect(recordRealtimeRelayBackpressure()).toBe(false)

    flushRealtimeRelayMetrics(true)
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ backpressureLogged: true, errors: 2 }),
      "realtime_relay_metric",
    )

    expect(recordRealtimeRelayBackpressure()).toBe(true)
  })
})
