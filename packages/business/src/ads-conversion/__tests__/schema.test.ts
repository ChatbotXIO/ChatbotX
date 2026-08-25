import { describe, expect, test } from "vitest"
import {
  recordFlowStepConversionInput,
  recordTriggerConversionInput,
} from "../schema"

const baseTriggerInput = {
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  triggerId: "trigger-1",
}

const baseFlowStepInput = {
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  flowNodeId: "node-1",
}

// Both `recordTriggerConversionInput` and `recordFlowStepConversionInput`
// share the exact same Purchase-enrichment validation (plan #4), so this
// suite exercises both with the same cases.
describe.each([
  [
    "recordTriggerConversionInput",
    recordTriggerConversionInput,
    baseTriggerInput,
  ],
  [
    "recordFlowStepConversionInput",
    recordFlowStepConversionInput,
    baseFlowStepInput,
  ],
] as const)("%s — Purchase enrichment validation", (_name, schema, base) => {
  test("accepts a lead event with no orderId/contents", () => {
    const result = schema.safeParse({ ...base, eventType: "lead" })
    expect(result.success).toBe(true)
  })

  test("rejects orderId on a non-purchase (lead) event", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "lead",
      orderId: "order-123",
    })
    expect(result.success).toBe(false)
  })

  test("rejects contents on a non-purchase (lead) event", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "lead",
      contents: [{ id: "sku-1", quantity: 1, itemPrice: 10 }],
    })
    expect(result.success).toBe(false)
  })

  test("accepts orderId + contents on a purchase event", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      value: "25",
      orderId: "order-123",
      contents: [
        { id: "sku-1", quantity: 2, itemPrice: 10 },
        { id: "sku-2", quantity: 1, itemPrice: 5 },
      ],
    })
    expect(result.success).toBe(true)
  })

  test("rejects a contents item with a non-positive quantity", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      contents: [{ id: "sku-1", quantity: 0, itemPrice: 10 }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects a contents item with a negative item_price", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      contents: [{ id: "sku-1", quantity: 1, itemPrice: -1 }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects a contents item with an empty id", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      contents: [{ id: "", quantity: 1, itemPrice: 10 }],
    })
    expect(result.success).toBe(false)
  })

  test("rejects an empty contents array", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      contents: [],
    })
    expect(result.success).toBe(false)
  })

  test("accepts value alone with no contents", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      value: "25",
    })
    expect(result.success).toBe(true)
  })

  test("accepts contents alone with no value", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      contents: [{ id: "sku-1", quantity: 1, itemPrice: 25 }],
    })
    expect(result.success).toBe(true)
  })

  test("accepts value that matches the sum of contents (quantity * item_price)", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      value: "35",
      contents: [
        { id: "sku-1", quantity: 2, itemPrice: 10 },
        { id: "sku-2", quantity: 1, itemPrice: 15 },
      ],
    })
    expect(result.success).toBe(true)
  })

  test("rejects a contradictory value/contents total", () => {
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      value: "999",
      contents: [{ id: "sku-1", quantity: 2, itemPrice: 10 }],
    })
    expect(result.success).toBe(false)
  })

  test("tolerates floating-point multiplication drift within epsilon", () => {
    // 3 * 0.1 === 0.30000000000000004 in IEEE-754 — must not false-positive
    // reject a genuinely-matching total.
    const result = schema.safeParse({
      ...base,
      eventType: "purchase",
      value: "0.3",
      contents: [{ id: "sku-1", quantity: 3, itemPrice: 0.1 }],
    })
    expect(result.success).toBe(true)
  })
})
