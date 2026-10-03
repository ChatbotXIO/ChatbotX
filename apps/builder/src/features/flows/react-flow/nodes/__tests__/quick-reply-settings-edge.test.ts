import { describe, expect, test } from "vitest"
import {
  isQuickReplySettingsEdgeInSync,
  resolveQuickReplySettingsEdge,
} from "../quick-reply-settings/edge"

const sendMessageTarget = (nodeId: string) => ({
  buttonType: "sendMessage" as const,
  beforeStep: {
    id: "step-1",
    stepType: "startAnotherNode" as const,
    nodeId,
    viewOnly: true,
  },
})

const externalFlowTarget = {
  buttonType: "startExternalFlow" as const,
  beforeStep: {
    id: "step-2",
    stepType: "startExternalFlow" as const,
    flowId: "flow-1",
  },
}

const base = {
  active: true,
  enabled: true,
  handleId: "handle-1",
  nodeId: "node-a",
}

describe("resolveQuickReplySettingsEdge", () => {
  test("follows the target node when the section is on", () => {
    expect(
      resolveQuickReplySettingsEdge({
        ...base,
        target: sendMessageTarget("node-b"),
      }),
    ).toEqual({ kind: "edge", targetNodeId: "node-b" })
  })

  test("drops the edge when the section is switched off", () => {
    expect(
      resolveQuickReplySettingsEdge({
        ...base,
        enabled: false,
        target: sendMessageTarget("node-b"),
      }),
    ).toEqual({ kind: "none" })
  })

  test("drops the edge when the target is cleared", () => {
    expect(resolveQuickReplySettingsEdge({ ...base, target: null })).toEqual({
      kind: "none",
    })
  })

  test("drops the edge for a target that routes without one", () => {
    expect(
      resolveQuickReplySettingsEdge({ ...base, target: externalFlowTarget }),
    ).toEqual({ kind: "none" })
  })

  test("drops the edge while the start-another-node combobox is empty", () => {
    expect(
      resolveQuickReplySettingsEdge({
        ...base,
        target: {
          buttonType: "startAnotherNode",
          beforeStep: {
            id: "step-3",
            stepType: "startAnotherNode",
            nodeId: "",
          },
        },
      }),
    ).toEqual({ kind: "none" })
  })

  test("drops the edge when the section is inactive (no quick replies, or Retry with Get User Data)", () => {
    expect(
      resolveQuickReplySettingsEdge({
        ...base,
        active: false,
        target: sendMessageTarget("node-b"),
      }),
    ).toEqual({ kind: "none" })
  })

  test("does nothing for a legacy node without a section id", () => {
    expect(
      resolveQuickReplySettingsEdge({
        ...base,
        handleId: undefined,
        target: sendMessageTarget("node-b"),
      }),
    ).toBeNull()
  })
})

const edge = (id: string, sourceHandle: string, target: string) => ({
  id,
  source: "node-a",
  target,
  sourceHandle,
  targetHandle: target,
  type: "buttonedge",
})

describe("isQuickReplySettingsEdgeInSync", () => {
  const other = edge("other", "qr-1", "node-z")
  const at = { handleId: "handle-1", nodeId: "node-a" }

  test("needs a sync when the edge is missing", () => {
    expect(
      isQuickReplySettingsEdgeInSync([other], {
        ...at,
        desired: { kind: "edge", targetNodeId: "node-b" },
      }),
    ).toBe(false)
  })

  test("is in sync when the edge already matches, even with a canvas-made id", () => {
    expect(
      isQuickReplySettingsEdgeInSync(
        [other, edge("canvas-id", "handle-1", "node-b")],
        { ...at, desired: { kind: "edge", targetNodeId: "node-b" } },
      ),
    ).toBe(true)
  })

  test("needs a sync when the edge points elsewhere", () => {
    expect(
      isQuickReplySettingsEdgeInSync(
        [other, edge("handle-1", "handle-1", "node-b")],
        { ...at, desired: { kind: "edge", targetNodeId: "node-c" } },
      ),
    ).toBe(false)
  })

  test("needs a sync when the handle has more than one edge", () => {
    expect(
      isQuickReplySettingsEdgeInSync(
        [
          edge("handle-1", "handle-1", "node-b"),
          edge("canvas-id", "handle-1", "node-c"),
        ],
        { ...at, desired: { kind: "edge", targetNodeId: "node-b" } },
      ),
    ).toBe(false)
  })

  test("needs a sync when an edge must be removed", () => {
    expect(
      isQuickReplySettingsEdgeInSync(
        [other, edge("handle-1", "handle-1", "node-b")],
        { ...at, desired: { kind: "none" } },
      ),
    ).toBe(false)
  })

  test("is in sync when there is nothing to remove", () => {
    expect(
      isQuickReplySettingsEdgeInSync([other], {
        ...at,
        desired: { kind: "none" },
      }),
    ).toBe(true)
  })
})
