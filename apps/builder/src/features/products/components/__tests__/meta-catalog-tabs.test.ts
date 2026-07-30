import { describe, expect, test } from "vitest"
import { resolveInitialMetaCatalogTab } from "../meta-catalog-tabs"
import type { MetaCatalogViewState } from "../meta-catalog-types"

const connection = {
  catalogId: "catalog-1",
} as NonNullable<MetaCatalogViewState["connection"]>

describe("resolveInitialMetaCatalogTab", () => {
  test("opens Sync to Meta when products are selected", () => {
    expect(
      resolveInitialMetaCatalogTab({
        connection: { ...connection, catalogId: null },
        hasHistory: true,
        hasSelection: true,
        isSetupFlow: true,
      }),
    ).toBe("sync")
  })

  test("opens import during setup when no products are selected", () => {
    expect(
      resolveInitialMetaCatalogTab({
        connection,
        hasHistory: true,
        hasSelection: false,
        isSetupFlow: true,
      }),
    ).toBe("import")
  })

  test("opens history for a disconnected workspace that has prior runs", () => {
    expect(
      resolveInitialMetaCatalogTab({
        connection: null,
        hasHistory: true,
        hasSelection: true,
        isSetupFlow: false,
      }),
    ).toBe("history")
  })
})
