import { describe, expect, it } from "vitest"
import { visibleShopCategories } from "../service"

const category = (id: string, parentId: string | null, isVisible = true) => ({
  id,
  parentId,
  isVisible,
})

const ids = (categories: Array<{ id: string }>) =>
  categories.map((item) => item.id)

describe("visibleShopCategories", () => {
  it("keeps visible categories and their visible sub-categories", () => {
    const shown = visibleShopCategories([
      category("shirts", null),
      category("t-shirts", "shirts"),
      category("hidden-child", "shirts", false),
    ])
    expect(ids(shown)).toEqual(["shirts", "t-shirts"])
  })

  it("drops a sub-category whose parent is hidden", () => {
    const shown = visibleShopCategories([
      category("shirts", null, false),
      category("t-shirts", "shirts"),
      category("shoes", null),
    ])
    expect(ids(shown)).toEqual(["shoes"])
  })

  it("drops a sub-category whose parent no longer exists", () => {
    const shown = visibleShopCategories([category("t-shirts", "gone")])
    expect(ids(shown)).toEqual([])
  })
})
