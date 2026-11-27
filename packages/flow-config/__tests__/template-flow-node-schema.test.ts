import { describe, expect, test } from "vitest"
import { templateFlowNodeSchema } from "../src/import-export/template-schema"

const node = (details: Record<string, unknown>) => ({
  id: "1",
  type: "performAction",
  data: { details },
})

describe("templateFlowNodeSchema", () => {
  test("a draft with half-written steps travels", () => {
    expect(
      templateFlowNodeSchema.safeParse(node({ steps: [{ stepType: "x" }] }))
        .success,
    ).toBe(true)
  })

  test("steps that are not a list are refused: the viewer walks them", () => {
    expect(
      templateFlowNodeSchema.safeParse(node({ steps: "unfinished" })).success,
    ).toBe(false)
  })

  test("a node without details is refused", () => {
    expect(
      templateFlowNodeSchema.safeParse({ id: "1", type: "x", data: {} })
        .success,
    ).toBe(false)
  })
})
