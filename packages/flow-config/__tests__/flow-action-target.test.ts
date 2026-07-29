import { describe, expect, test } from "vitest"
import type { FlowNode } from "../src"
import {
  buttonStepDefaultFn,
  resolveFlowActionTarget,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendMessageNodeDefaultFn,
  sendTextStepDefaultFn,
  whatsappOptionListStepDefaultFn,
} from "../src"

type NodeDetails = Parameters<typeof sendMessageNodeDefaultFn>[0]["detailProps"]

const makeNode = (id: string, detailProps: NodeDetails): FlowNode =>
  sendMessageNodeDefaultFn({ nodeProps: { id }, detailProps }) as FlowNode

describe("resolveFlowActionTarget", () => {
  test("resolves a button owned by a step", () => {
    const button = buttonStepDefaultFn({ label: "Buy now" })
    const node = makeNode("node-1", {
      steps: [sendTextStepDefaultFn({ text: "Hi", buttons: [button] })],
    })

    expect(resolveFlowActionTarget([node], button.id)).toEqual({
      details: button,
      nodeId: "node-1",
      targetType: "button",
    })
  })

  test("resolves a button nested in a carousel card", () => {
    const button = buttonStepDefaultFn({ label: "Details" })
    const card = {
      ...sendCardStepDefaultFn(),
      title: "Card",
      buttons: [button],
    }
    const node = makeNode("node-1", {
      steps: [{ ...sendCarouselStepDefaultFn(), cards: [card] }],
    })

    expect(resolveFlowActionTarget([node], button.id)).toEqual({
      details: button,
      nodeId: "node-1",
      targetType: "button",
    })
  })

  test("resolves a WhatsApp option list item as a button target", () => {
    const step = whatsappOptionListStepDefaultFn({ text: "Pick one" })
    const option = step.options[0]
    const node = makeNode("node-1", { steps: [step] })

    expect(resolveFlowActionTarget([node], option.id)).toMatchObject({
      details: { id: option.id, label: option.title },
      nodeId: "node-1",
      targetType: "button",
    })
  })

  test("resolves a node-level quick reply as a quickReply target", () => {
    const quickReply = buttonStepDefaultFn({ label: "Yes" })
    const node = makeNode("node-1", {
      steps: [sendTextStepDefaultFn({ text: "Ready?" })],
      quickReplies: [quickReply],
    })

    expect(resolveFlowActionTarget([node], quickReply.id)).toEqual({
      details: quickReply,
      nodeId: "node-1",
      targetType: "quickReply",
    })
  })

  test("finds a quick reply on a later node", () => {
    const quickReply = buttonStepDefaultFn({ label: "Yes" })
    const nodes = [
      makeNode("node-1", { steps: [sendTextStepDefaultFn({ text: "Hi" })] }),
      makeNode("node-2", { steps: [], quickReplies: [quickReply] }),
    ]

    expect(resolveFlowActionTarget(nodes, quickReply.id)).toMatchObject({
      nodeId: "node-2",
      targetType: "quickReply",
    })
  })

  test("prefers a step button when a quick reply reuses the same id", () => {
    const button = buttonStepDefaultFn({ label: "Buy now" })
    const nodes = [
      makeNode("node-1", {
        steps: [sendTextStepDefaultFn({ text: "Hi", buttons: [button] })],
      }),
      makeNode("node-2", {
        steps: [],
        quickReplies: [{ ...button, label: "Yes" }],
      }),
    ]

    expect(resolveFlowActionTarget(nodes, button.id)).toMatchObject({
      nodeId: "node-1",
      targetType: "button",
    })
  })

  test("returns null when no node owns the action id", () => {
    const node = makeNode("node-1", {
      steps: [sendTextStepDefaultFn({ text: "Hi" })],
      quickReplies: [buttonStepDefaultFn({ label: "Yes" })],
    })

    expect(resolveFlowActionTarget([node], "9999999999999")).toBeNull()
  })
})
