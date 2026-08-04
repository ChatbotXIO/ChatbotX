import type { FlowNode } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { selectedNodeEqualityFn } from "../selected-node-equality"

const flowNode = (
  id: string,
  name: string,
  details: Record<string, unknown> = {},
): FlowNode =>
  ({
    id,
    type: "sendMessage",
    position: { x: 0, y: 0 },
    data: { name, details },
  }) as unknown as FlowNode

describe("selectedNodeEqualityFn", () => {
  test("treats the same reference as equal", () => {
    const node = flowNode("1", "Send Message #2")

    expect(selectedNodeEqualityFn(node, node)).toBe(true)
  })

  test("re-renders when the node name changes so the sheet title stays in sync", () => {
    const before = flowNode("1", "Send Message #2")
    const after = flowNode("1", "PF-01")

    expect(selectedNodeEqualityFn(before, after)).toBe(false)
  })

  test("does not re-render when only node details change (avoid re-seeding the editor while typing)", () => {
    const before = flowNode("1", "Send Message #2", { text: "hello" })
    const after = flowNode("1", "Send Message #2", { text: "hello world" })

    expect(selectedNodeEqualityFn(before, after)).toBe(true)
  })

  test("re-renders when a different node becomes selected", () => {
    const first = flowNode("1", "Send Message #2")
    const second = flowNode("2", "Send Message #2")

    expect(selectedNodeEqualityFn(first, second)).toBe(false)
  })

  test("handles null transitions when selection clears or begins", () => {
    const node = flowNode("1", "Send Message #2")

    expect(selectedNodeEqualityFn(null, null)).toBe(true)
    expect(selectedNodeEqualityFn(null, node)).toBe(false)
    expect(selectedNodeEqualityFn(node, null)).toBe(false)
  })
})
