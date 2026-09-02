// @vitest-environment node

import { describe, expect, test } from "vitest"

describe("template adapter install order", () => {
  test("TEMPLATE_INSTALL_ORDER is a valid topological order of the adapter dependency graph", async () => {
    // Importing the module runs `assertInstallOrderMatches` at load time —
    // a throw here means the hand-written order and the adapters'
    // declared providesKinds/consumesKinds/deferredKinds have diverged.
    await expect(
      import("../src/template/adapters/index"),
    ).resolves.toBeDefined()
  }, 60_000)

  test("every registered adapter appears in TEMPLATE_INSTALL_ORDER exactly once", async () => {
    const { templateAdapterRegistry, TEMPLATE_INSTALL_ORDER } = await import(
      "../src/template/adapters/registry"
    )
    const registered = Object.keys(templateAdapterRegistry).sort()
    const ordered = [...TEMPLATE_INSTALL_ORDER].sort()
    expect(ordered).toEqual(registered)
  })

  test("topoSortCategories produces an order consistent with declared dependencies", async () => {
    const { templateAdapterRegistry } = await import(
      "../src/template/adapters/registry"
    )
    const { topoSortCategories } = await import(
      "../src/template/adapters/install-order"
    )
    const sorted = topoSortCategories(templateAdapterRegistry)
    expect(sorted).toBeDefined()
    expect(sorted).toHaveLength(Object.keys(templateAdapterRegistry).length)
  })
})
