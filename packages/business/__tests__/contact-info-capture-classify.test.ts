import type { OutgoingBotMessage } from "@chatbotx.io/database/repositories"
import { describe, expect, test } from "vitest"
import {
  type BotSourceResolution,
  resolveLastBotSource,
} from "../src/contact-info-capture/classify"

let nextId = 1000
const message = (
  contentAttributes: OutgoingBotMessage["contentAttributes"],
): OutgoingBotMessage => ({
  contentAttributes,
  createdAtExact: "2026-06-01T00:00:00.000000Z",
  id: String(nextId++),
})

const broadcastFlow = (broadcastId: string, flowId: string) =>
  message({
    flowId,
    metadata: { broadcastId, contactInboxId: "9", type: "broadcast" },
  })
const flowOnly = (flowId: string, metadata?: Record<string, unknown>) =>
  message({ flowId, ...(metadata ? { metadata } : {}) })

const attributed = (
  sourceId: string,
  followedFlowId?: string,
): BotSourceResolution => ({
  followedFlowId,
  kind: "attributed",
  sourceId,
  sourceType: "broadcast",
})
const stop: BotSourceResolution = { kind: "stop" }

describe("resolveLastBotSource", () => {
  test("attributes a broadcast flow message", () => {
    expect(resolveLastBotSource([broadcastFlow("77", "5")])).toEqual(
      attributed("77"),
    )
  })

  test("attributes a broadcast template message (id in contentAttributes)", () => {
    expect(
      resolveLastBotSource([
        message({
          broadcastId: "78",
          metadata: { broadcastId: "78", type: "broadcast" },
          type: "whatsapp_template",
        }),
      ]),
    ).toEqual(attributed("78"))
  })

  test("a continuation message of the broadcast's own flow keeps the attribution", () => {
    expect(
      resolveLastBotSource([flowOnly("5"), broadcastFlow("77", "5")]),
    ).toEqual(attributed("77", "5"))
  })

  test("a Get User Data question (flowId, no metadata) is a continuation", () => {
    expect(
      resolveLastBotSource([
        flowOnly("5"),
        flowOnly("5"),
        broadcastFlow("77", "5"),
      ]),
    ).toEqual(attributed("77", "5"))
  })

  test.each([
    "updateStatus",
    "appointmentWebviewSelection",
    "appointmentAvailabilityRangeSelection",
    "appointmentAvailabilityRangeSkipped",
    "getUserDataWebviewSelection",
    "stepInputResolution",
  ])("%s metadata is a flow continuation", (type) => {
    expect(
      resolveLastBotSource([flowOnly("5", { type }), broadcastFlow("77", "5")]),
    ).toEqual(attributed("77", "5"))
  })

  test("a continuation of another flow stops, even when an older message is the broadcast", () => {
    expect(
      resolveLastBotSource([flowOnly("6"), broadcastFlow("77", "5")]),
    ).toEqual(stop)
  })

  test("a continuation after the broadcast's flow switched mid-walk stops", () => {
    expect(
      resolveLastBotSource([
        flowOnly("5"),
        flowOnly("6"),
        broadcastFlow("77", "5"),
      ]),
    ).toEqual(stop)
  })

  test("a template broadcast followed by a flow message stops (flows differ)", () => {
    expect(
      resolveLastBotSource([
        flowOnly("5"),
        message({ broadcastId: "78", type: "messenger_template" }),
      ]),
    ).toEqual(stop)
  })

  test("a template followed by a flow-less bot message stops", () => {
    expect(
      resolveLastBotSource([
        message({ text: "ai reply" }),
        message({ broadcastId: "78" }),
      ]),
    ).toEqual(stop)
  })

  test.each([
    "sequenceSchedule",
    "commentAutomation",
    "someFutureAutomation",
  ])("%s metadata stops even with the same flowId", (type) => {
    expect(
      resolveLastBotSource([flowOnly("5", { type }), broadcastFlow("77", "5")]),
    ).toEqual(stop)
  })

  test("a flow-less bot message stops", () => {
    expect(resolveLastBotSource([message(null)])).toEqual(stop)
    expect(resolveLastBotSource([message({})])).toEqual(stop)
  })

  test("another source's marker without a usable id stops", () => {
    expect(
      resolveLastBotSource([
        message({ flowId: "5", metadata: { type: "broadcast" } }),
      ]),
    ).toEqual(stop)
    expect(
      resolveLastBotSource([message({ broadcastId: "abc", flowId: "5" })]),
    ).toEqual({ kind: "continue", followedFlowId: "5" })
  })

  test("malformed contentAttributes never throw", () => {
    const malformed = [
      message("text" as never),
      message([] as never),
      message({ flowId: 5, metadata: "x" } as never),
      message({ flowId: "5", metadata: { type: 7 } } as never),
    ]
    for (const entry of malformed) {
      expect(() => resolveLastBotSource([entry])).not.toThrow()
    }
    expect(resolveLastBotSource([malformed[0]])).toEqual(stop)
  })

  test("an empty or all-continuation page continues, carrying the followed flow", () => {
    expect(resolveLastBotSource([])).toEqual({
      followedFlowId: undefined,
      kind: "continue",
    })
    expect(resolveLastBotSource([flowOnly("5"), flowOnly("5")])).toEqual({
      followedFlowId: "5",
      kind: "continue",
    })
  })

  test("resumes from the followed flow of a previous page", () => {
    expect(
      resolveLastBotSource([broadcastFlow("77", "5")], { followedFlowId: "5" }),
    ).toEqual(attributed("77", "5"))
    expect(
      resolveLastBotSource([broadcastFlow("77", "6")], { followedFlowId: "5" }),
    ).toEqual(stop)
    expect(
      resolveLastBotSource([flowOnly("6")], { followedFlowId: "5" }),
    ).toEqual(stop)
  })
})
