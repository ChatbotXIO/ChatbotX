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
  })

  test("enables selective retry only for the idempotent analytics dashboard stream", () => {
    expect(dashboardEventBus.getConfig()).toMatchObject({
      deadLetterMaxLen: 100_000,
      deadLetterStreamKey: "events:analytics-dashboard:dead",
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
