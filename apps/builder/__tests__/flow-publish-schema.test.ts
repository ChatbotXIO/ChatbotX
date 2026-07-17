import {
  followUpNodeDefaultFn,
  startFlowNodeDefaultFn,
  waitNodeDefaultFn,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { updateFlowVersionSchema } from "@/features/flows/schemas/action"

const defaultNodeProps = {
  nodeProps: { id: "n1", labelVersion: 1, position: { x: 0, y: 0 } },
  dataProps: {},
  detailProps: {},
}

describe("client-side publish validation (updateFlowVersionSchema)", () => {
  test.each([
    ["wait", waitNodeDefaultFn],
    ["followUp", followUpNodeDefaultFn],
  ])("accepts a default %s node", (_type, defaultFn) => {
    // Arrange
    const node = defaultFn(defaultNodeProps)

    // Act
    const result = updateFlowVersionSchema.safeParse({
      nodes: [node],
      edges: [],
    })

    // Assert
    expect(result.success).toBe(true)
  })

  test("accepts a configured startFlow node", () => {
    // Arrange
    const base = startFlowNodeDefaultFn(defaultNodeProps)
    const node = {
      ...base,
      data: {
        ...base.data,
        details: {
          ...base.data.details,
          beforeStep: { ...base.data.details.beforeStep, flowId: "123" },
        },
      },
    }

    // Act
    const result = updateFlowVersionSchema.safeParse({
      nodes: [node],
      edges: [],
    })

    // Assert
    expect(result.success).toBe(true)
  })

  test("rejects an unconfigured startFlow node (no target flow selected)", () => {
    // Arrange
    const node = startFlowNodeDefaultFn(defaultNodeProps)

    // Act
    const result = updateFlowVersionSchema.safeParse({
      nodes: [node],
      edges: [],
    })

    // Assert
    expect(result.success).toBe(false)
  })

  test("rejects a node with an unknown type", () => {
    const node = {
      ...startFlowNodeDefaultFn(defaultNodeProps),
      type: "unknownNodeType",
    }

    const result = updateFlowVersionSchema.safeParse({
      nodes: [node],
      edges: [],
    })

    expect(result.success).toBe(false)
  })
})
