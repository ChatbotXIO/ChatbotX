// @vitest-environment node

import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { describe, expect, test } from "vitest"
import { REALTIME_EVENT_SCHEMAS } from "../src/features/realtime/realtime-event-validation"

const schema = REALTIME_EVENT_SCHEMAS[RealtimeEventType.pipelineItemChanged]

describe("realtime pipelineItemChanged validation", () => {
  test("is registered in the client-side schema map", () => {
    expect(schema).toBeDefined()
  })

  test("accepts a full payload including the optional contactId", () => {
    const data = {
      pipelineId: "1",
      itemId: "2",
      contactId: "3",
      change: "moved",
    }

    expect(schema?.safeParse(data)).toMatchObject({ success: true, data })
  })

  test("accepts a bulk payload without itemId and contactId", () => {
    const result = schema?.safeParse({ pipelineId: "1", change: "bulk" })

    expect(result?.success).toBe(true)
  })

  test.each([
    "created",
    "updated",
    "moved",
    "deleted",
    "bulk",
  ])("accepts change %s", (change) => {
    expect(schema?.safeParse({ pipelineId: "1", change }).success).toBe(true)
  })

  test.each([
    ["a missing pipelineId", { change: "moved" }],
    ["a missing change", { pipelineId: "1" }],
    ["an unknown change", { pipelineId: "1", change: "archived" }],
    ["a numeric pipelineId", { pipelineId: 1, change: "moved" }],
    ["a numeric contactId", { pipelineId: "1", contactId: 3, change: "moved" }],
    ["null data", null],
  ])("rejects %s", (_name, data) => {
    expect(schema?.safeParse(data).success).toBe(false)
  })
})
