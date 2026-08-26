import { describe, expect, test } from "vitest"
import {
  actionSteps,
  FLOW_EXPORT_FORMAT_VERSION,
  parseFlowExport,
  performActionNodeDefaultFn,
  stepTypes,
  trackAdsLeadDefaultFn,
  trackAdsLeadSchema,
  trackAdsPurchaseDefaultFn,
  trackAdsPurchaseSchema,
} from "../src"

describe("Track Ads Lead flow step contract", () => {
  test("accepts the default step (no config beyond the discriminant)", () => {
    expect(trackAdsLeadSchema.parse(trackAdsLeadDefaultFn())).toEqual(
      expect.objectContaining({ stepType: "trackAdsLead" }),
    )
  })

  test("rejects the wrong step type", () => {
    expect(() =>
      trackAdsLeadSchema.parse({
        ...trackAdsLeadDefaultFn(),
        stepType: "sendMetaCapiEvent",
      }),
    ).toThrow()
  })

  test("creates safe defaults with success and error states", () => {
    const value = trackAdsLeadDefaultFn()

    expect(value).toMatchObject({ stepType: "trackAdsLead" })
    expect(value.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
    expect(value.states.every((state) => Boolean(state.id))).toBe(true)
    expect(value.id).toBeTruthy()
  })

  test("is registered in the step enum and shared action union", () => {
    const defaults = trackAdsLeadDefaultFn()

    expect(stepTypes.options).toContain("trackAdsLead")
    expect(
      actionSteps.some((schema) => schema.safeParse(defaults).success),
    ).toBe(true)
  })
})

describe("Track Ads Purchase flow step contract", () => {
  test("accepts the default step with static value/currency unset", () => {
    expect(trackAdsPurchaseSchema.parse(trackAdsPurchaseDefaultFn())).toEqual(
      expect.objectContaining({
        stepType: "trackAdsPurchase",
        value: undefined,
        currency: undefined,
      }),
    )
  })

  test("rejects the wrong step type", () => {
    expect(() =>
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        stepType: "trackAdsLead",
      }),
    ).toThrow()
  })

  test("accepts numeric value text", () => {
    expect(
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        value: "10.5",
      }).value,
    ).toBe("10.5")
  })

  test("rejects non-numeric value text", () => {
    expect(() =>
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        value: "abc",
      }),
    ).toThrow()
  })

  test("rejects invalid currency codes", () => {
    expect(() =>
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        currency: "US",
      }),
    ).toThrow()
  })

  test("normalizes currency codes to uppercase", () => {
    expect(
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        currency: "usd",
      }).currency,
    ).toBe("USD")
  })

  test("treats cleared value and currency fields as unset", () => {
    const parsed = trackAdsPurchaseSchema.parse({
      ...trackAdsPurchaseDefaultFn(),
      value: "",
      currency: "   ",
    })

    expect(parsed.value).toBeUndefined()
    expect(parsed.currency).toBeUndefined()
  })

  test("creates safe defaults with success and error states", () => {
    const value = trackAdsPurchaseDefaultFn()

    expect(value).toMatchObject({ stepType: "trackAdsPurchase" })
    expect(value.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
    ])
    expect(value.states.every((state) => Boolean(state.id))).toBe(true)
  })

  test("is registered in the step enum and shared action union", () => {
    const defaults = trackAdsPurchaseDefaultFn()

    expect(stepTypes.options).toContain("trackAdsPurchase")
    expect(
      actionSteps.some((schema) => schema.safeParse(defaults).success),
    ).toBe(true)
  })

  test("accepts orderId + contents (plan #4)", () => {
    const parsed = trackAdsPurchaseSchema.parse({
      ...trackAdsPurchaseDefaultFn(),
      value: "35",
      orderId: "order-123",
      contents: [
        { id: "sku-1", quantity: 2, itemPrice: 10 },
        { id: "sku-2", quantity: 1, itemPrice: 15 },
      ],
    })

    expect(parsed.orderId).toBe("order-123")
    expect(parsed.contents).toHaveLength(2)
  })

  test("treats a cleared orderId field as unset", () => {
    const parsed = trackAdsPurchaseSchema.parse({
      ...trackAdsPurchaseDefaultFn(),
      orderId: "",
    })

    expect(parsed.orderId).toBeUndefined()
  })

  test("rejects a contradictory value/contents total", () => {
    expect(() =>
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        value: "999",
        contents: [{ id: "sku-1", quantity: 2, itemPrice: 10 }],
      }),
    ).toThrow()
  })

  test("rejects a contents item with a non-positive quantity", () => {
    expect(() =>
      trackAdsPurchaseSchema.parse({
        ...trackAdsPurchaseDefaultFn(),
        contents: [{ id: "sku-1", quantity: 0, itemPrice: 10 }],
      }),
    ).toThrow()
  })
})

/**
 * Codex finding 4: `actionSteps` is the real validation chokepoint, consumed
 * by `performActionNodeSchema` (`packages/flow-config/src/nodes/
 * perform-action.ts`), which itself is part of `flowVersionSchema`'s node
 * union. A schema-local `.parse()` passing is not sufficient proof the step
 * actually publishes — this exercises the real publish/import path
 * (`parseFlowExport`, mirroring `import-export.test.ts`'s fixture pattern)
 * with a `performAction` node carrying BOTH new steps.
 */
describe("Track Ads flow steps on the real publish path", () => {
  test("a performAction node with trackAdsLead + trackAdsPurchase steps survives parseFlowExport", () => {
    const performActionNode = performActionNodeDefaultFn({
      labelVersion: 1,
      nodeProps: { id: "1" },
      detailProps: {
        steps: [
          trackAdsLeadDefaultFn(),
          { ...trackAdsPurchaseDefaultFn(), value: "19.99", currency: "USD" },
        ],
      },
    })

    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [
        {
          name: "Ads tracking fixture flow",
          active: true,
          enableInInbox: true,
          startNodeId: performActionNode.id,
          nodes: [performActionNode],
          edges: [],
        },
      ],
    }

    const serialized = JSON.parse(JSON.stringify(envelope))
    const result = parseFlowExport(serialized)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const importedNode = result.data.flows[0].nodes[0]
    expect(importedNode).toEqual(performActionNode)
  })

  test("a performAction node with an invalid trackAdsPurchase step (bad currency) fails parseFlowExport", () => {
    const performActionNode = performActionNodeDefaultFn({
      labelVersion: 1,
      nodeProps: { id: "1" },
      detailProps: {
        steps: [{ ...trackAdsPurchaseDefaultFn(), currency: "US" }],
      },
    })

    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [
        {
          name: "Ads tracking fixture flow (invalid)",
          active: true,
          enableInInbox: true,
          startNodeId: performActionNode.id,
          nodes: [performActionNode],
          edges: [],
        },
      ],
    }

    const serialized = JSON.parse(JSON.stringify(envelope))
    const result = parseFlowExport(serialized)

    expect(result.ok).toBe(false)
  })
})
