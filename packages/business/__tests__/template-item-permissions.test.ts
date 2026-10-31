// @vitest-environment node
import { describe, expect, test } from "vitest"
import { buildItemPermissions } from "../src/template/item-permissions"

describe("buildItemPermissions", () => {
  test("a selection with no locks adds nothing, so the payload stays v1", () => {
    expect(
      buildItemPermissions(
        { flows: { mode: "ids", ids: ["f1"] } },
        { flows: ["f1"] },
      ),
    ).toEqual({})
  })

  test("lists only the locked ids of an ids selection", () => {
    expect(
      buildItemPermissions(
        { flows: { mode: "ids", ids: ["f1", "f2"], lockedIds: ["f2"] } },
        { flows: ["f1", "f2"] },
      ),
    ).toEqual({ flows: { f2: { allowEdit: false } } })
  })

  test("lockAll locks every entry in the category, folded-in dependencies included", () => {
    expect(
      buildItemPermissions(
        { flows: { mode: "all", lockAll: true } },
        { flows: ["f1", "f2", "f3"] },
      ),
    ).toEqual({
      flows: {
        f1: { allowEdit: false },
        f2: { allowEdit: false },
        f3: { allowEdit: false },
      },
    })
  })

  test("a locked id that was never selected rejects the save", () => {
    expect(() =>
      buildItemPermissions(
        { flows: { mode: "ids", ids: ["f1"], lockedIds: ["f9"] } },
        { flows: ["f1"] },
      ),
    ).toThrow(expect.objectContaining({ code: "templateSaveInvalidSelection" }))
  })

  test("a locked id absent from the payload (deleted since) is dropped", () => {
    expect(
      buildItemPermissions(
        { flows: { mode: "ids", ids: ["f1", "f2"], lockedIds: ["f2"] } },
        { flows: ["f1"] },
      ),
    ).toEqual({})
  })
})
