import { describe, expect, test } from "vitest"
import {
  buildAdminPieModel,
  OTHER_SLICE_KEY,
} from "../src/features/pipelines/lib/admin-pie-model"

const row = (name: string, created: number, won = 0, lost = 0) => ({
  name,
  created,
  won,
  lost,
})

describe("buildAdminPieModel", () => {
  test("gives the most active admins the slots, in activity order", () => {
    const model = buildAdminPieModel(
      [row("Low", 1), row("High", 5, 2), row("Mid", 3)],
      5,
    )

    expect(model.slotted.map((entry) => entry.name)).toEqual([
      "High",
      "Mid",
      "Low",
    ])
    expect(model.slotted.map((entry) => entry.slot)).toEqual([0, 1, 2])
    expect(model.hasOther).toBe(false)
  })

  test("an admin keeps one key across every pie", () => {
    const model = buildAdminPieModel([row("Ann", 2, 1, 1), row("Bo", 1)], 5)
    const ann = model.slotted.find((entry) => entry.name === "Ann")?.key

    expect(model.slices.created.map((slice) => slice.key)).toContain(ann)
    expect(model.slices.won).toEqual([{ key: ann, value: 1 }])
    expect(model.slices.lost).toEqual([{ key: ann, value: 1 }])
  })

  test("admins past the last slot fold into one Other slice", () => {
    const model = buildAdminPieModel(
      [row("A", 4), row("B", 3), row("C", 2), row("D", 1)],
      2,
    )

    expect(model.slotted.map((entry) => entry.name)).toEqual(["A", "B"])
    expect(model.hasOther).toBe(true)
    expect(model.slices.created).toContainEqual({
      key: OTHER_SLICE_KEY,
      value: 3,
    })
  })

  test("inactive admins take no slot and zero values make no slice", () => {
    const model = buildAdminPieModel([row("Idle", 0), row("Busy", 2)], 5)

    expect(model.slotted.map((entry) => entry.name)).toEqual(["Busy"])
    expect(model.slices.won).toEqual([])
    expect(model.slices.lost).toEqual([])
  })

  test("ties break by name so colors are stable between renders", () => {
    const first = buildAdminPieModel([row("Zed", 1), row("Amy", 1)], 5)
    const second = buildAdminPieModel([row("Amy", 1), row("Zed", 1)], 5)

    expect(first.slotted).toEqual(second.slotted)
    expect(first.slotted[0].name).toBe("Amy")
  })

  test("no activity yields empty pies", () => {
    const model = buildAdminPieModel([], 5)

    expect(model).toEqual({
      slotted: [],
      hasOther: false,
      slices: { created: [], won: [], lost: [] },
    })
  })
})
