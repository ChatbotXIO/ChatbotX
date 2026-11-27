import { describe, expect, test } from "vitest"
import { liveDraftTargets } from "../src/features/pipelines/lib/add-item-draft"

describe("liveDraftTargets", () => {
  test("keeps a stage and field values the pipeline still has", () => {
    expect(
      liveDraftTargets(
        { stageId: "2", fieldValues: { "10": "vip", "11": "x" } },
        { openStageIds: ["1", "2"], fieldIds: ["10", "11"] },
      ),
    ).toEqual({ stageId: "2", fieldValues: { "10": "vip", "11": "x" } })
  })

  test("drops a field deleted while the sheet was open, keeping the rest", () => {
    expect(
      liveDraftTargets(
        { stageId: "", fieldValues: { "10": "vip", "11": "x" } },
        { openStageIds: ["1"], fieldIds: ["11"] },
      ).fieldValues,
    ).toEqual({ "11": "x" })
  })

  test("a deleted or busy stage falls back to the first open stage", () => {
    expect(
      liveDraftTargets(
        { stageId: "2", fieldValues: {} },
        { openStageIds: ["1"], fieldIds: [] },
      ).stageId,
    ).toBe("")
  })
})
