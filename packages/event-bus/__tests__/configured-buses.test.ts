import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import { describe, expect, test, vi } from "vitest"

const workerConfigMock = vi.hoisted(() => {
  const redis = {}
  return {
    getRedisConnection: vi.fn(() => redis),
  }
})

vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: workerConfigMock.getRedisConnection,
}))

import { dashboardEventBus } from "../src/dashboard/event-bus"
import { errorLogEventBus } from "../src/error-log/event-bus"
import { FlowEventBusByType, flowEventBus } from "../src/flow/event-bus"
import {
  MessageEventBusByType,
  messageEventBus,
} from "../src/message/event-bus"

describe("configured event buses", () => {
  test("configures stream keys, groups, retention, and schemas", () => {
    expect(messageEventBus.getConfig()).toMatchObject({
      consumerGroup: "message-events-group",
      maxLen: 100_000,
      streamKey: "events:message",
    })
    expect(flowEventBus.getConfig()).toMatchObject({
      consumerGroup: "flow-events-group",
      maxLen: 100_000,
      streamKey: "flow:events",
    })
    expect(dashboardEventBus.getConfig()).toMatchObject({
      consumerGroup: "analytics-dashboard-events-group",
      maxLen: 500_000,
      streamKey: "events:analytics-dashboard",
    })
    // Sized from a byte budget, not copied: entries survive acking until MAXLEN
    // evicts them, and an error-log `detail` can be 8KB.
    expect(errorLogEventBus.getConfig()).toMatchObject({
      consumerGroup: "error-log-events-group",
      maxLen: 50_000,
      streamKey: "events:error-log",
    })
  })

  test("enables selective retry only for the idempotent dashboard and error-log streams", () => {
    expect(dashboardEventBus.getConfig()).toMatchObject({
      deadLetterMaxLen: 100_000,
      deadLetterStreamKey: "events:analytics-dashboard:dead",
      enableSelectiveRetry: true,
      maxDeliveries: 5,
    })
    expect(errorLogEventBus.getConfig()).toMatchObject({
      deadLetterMaxLen: 10_000,
      deadLetterStreamKey: "events:error-log:dead",
      enableSelectiveRetry: true,
      maxDeliveries: 5,
    })
    expect(messageEventBus.getConfig().enableSelectiveRetry).toBeUndefined()
    expect(flowEventBus.getConfig().enableSelectiveRetry).toBeUndefined()
  })

  test("maps every message and flow event type to its bus", () => {
    for (const type of messageEventTypeSchema.options) {
      expect(MessageEventBusByType[type]).toBe(messageEventBus)
    }
    for (const type of flowEventTypeSchema.options) {
      expect(FlowEventBusByType[type]).toBe(flowEventBus)
    }
  })
})
