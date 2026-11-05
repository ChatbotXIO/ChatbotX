// @vitest-environment node

import { describe, expect, test } from "vitest"
import { countDroppedReferences } from "../src/template/snapshot-dropped"

const trigger = (pipelineId: string) => ({
  sourceId: "t1",
  actions: [{ type: "movePipelineItem", pipelineId }],
})

const count = (results: Record<string, { entries: unknown[] }>) =>
  countDroppedReferences({
    results: results as never,
    referenced: { tagIds: [], customFieldIds: [] },
    foundTagIds: new Set(),
    foundCustomFieldIds: new Set(),
    triggerConditions: [],
    pipelineManifest: {},
    productCategoryIds: new Set(),
    placeCategoryIds: new Set(),
  })

describe("countDroppedReferences", () => {
  test("a selected pipeline ships, so a reference to it is not dropped", () => {
    const results = {
      triggers: { entries: [trigger("11756649046119891")] },
      pipelines: {
        entries: [{ sourceId: "11756649046119891", stages: [], fields: [] }],
      },
    }
    const withoutIt = { triggers: results.triggers }

    expect(count(withoutIt)).toBe(1)
    expect(count(results)).toBe(0)
  })
})
