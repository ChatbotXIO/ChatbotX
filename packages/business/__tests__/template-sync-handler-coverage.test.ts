// @vitest-environment node

import { describe, expect, test } from "vitest"
import { templateAdapterRegistry } from "../src/template/adapters/registry"
import { isUpdatable } from "../src/template/adapters/shared"

describe("template adapters: sync handlers", () => {
  test("every registered adapter declares a sync handler; only the listed categories cannot update in place", () => {
    for (const adapter of Object.values(templateAdapterRegistry)) {
      expect(adapter.sync).toBeDefined()
    }
    const unsupported = Object.entries(templateAdapterRegistry)
      .filter(([, adapter]) => !isUpdatable(adapter.sync))
      .map(([category]) => category)
      .sort()
    expect(unsupported).toEqual([
      "aiFiles",
      "aiMcpServers",
      "calendars",
      "couponTopics",
      "entryPointLinks",
      "fbCommentAutomations",
      "pipelines",
      "products",
      "questionnaires",
      "webchats",
    ])
  })
})
