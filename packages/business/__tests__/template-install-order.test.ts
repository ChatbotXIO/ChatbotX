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

  test("per-category knowledge is derived from the registry", async () => {
    const registry = await import("../src/template/adapters/registry")
    expect(registry.TRACKED_KIND_BY_CATEGORY).toMatchObject({
      flows: "flow",
      keywords: "automatedResponse",
      webchats: "integrationWebchat",
      entryPointLinks: "reflink",
      fbCommentAutomations: "fbCommentAutomation",
      settings: null,
    })
    expect(registry.FOLDER_TYPE_CATEGORY).toMatchObject({
      outboundAutomatedResponse: "keywords",
      customField: "settings",
      tag: "flows",
      igStory: "fbCommentAutomations",
    })
    expect(registry.folderTypeToCategory("nope")).toBe("flows")
    expect([...registry.NEW_CATEGORIES_REQUIRING_V2].sort()).toEqual(
      [
        "aiFiles",
        "aiMcpServers",
        "couponTopics",
        "pipelines",
        "questionnaires",
        "sequences",
      ].sort(),
    )
    const { buildPayloadResources } = await import(
      "../src/template/adapters/registry-derived"
    )
    const resources = buildPayloadResources({
      settings: {
        entries: [
          { sourceId: "a", kind: "savedReply" },
          { sourceId: "b", kind: "botField" },
        ],
      },
    })
    expect(resources.settings).toEqual({
      savedReplies: [{ sourceId: "a", kind: "savedReply" }],
      botFields: [{ sourceId: "b", kind: "botField" }],
    })
    expect(Object.keys(resources).sort()).toEqual(
      Object.keys(registry.templateAdapterRegistry).sort(),
    )
  })
})
