import { describe, expect, test } from "vitest"
import { moveTargetStages } from "../src/features/pipelines/lib/move-targets"

const column = (id: string, bulkJobId: string | null = null) => ({
  stage: { id, bulkJobId },
})

describe("moveTargetStages", () => {
  test("excludes the current stage", () => {
    const result = moveTargetStages([column("1"), column("2")], "1")

    expect(result.map(({ stage }) => stage.id)).toEqual(["2"])
  })

  test("excludes stages running a bulk job", () => {
    const result = moveTargetStages(
      [column("1"), column("2", "job"), column("3")],
      "1",
    )

    expect(result.map(({ stage }) => stage.id)).toEqual(["3"])
  })

  test("offers every free stage while the item is not loaded", () => {
    expect(
      moveTargetStages([column("1"), column("2")], undefined),
    ).toHaveLength(2)
  })
})
