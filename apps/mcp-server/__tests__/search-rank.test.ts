import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { specWithTools } from "./helpers/spec-fixture"

describe("rankTools via searchTools", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("a Vietnamese query ranks the right tool first via synonym expansion", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        {
          name: "contacts.removeTags",
          summary: "Remove tags from contact",
          description: "Removes named tags from a contact.",
        },
        {
          name: "contacts.setTags",
          summary: "Replace contact tags",
          description: "Replaces every current tag.",
        },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("Gỡ nhãn VIP của Ada")[0]?.name).toBe(
      "contacts_remove_tags",
    )
  })

  test("a rare token (low document frequency) outweighs a common one", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        {
          name: "flows.publish",
          summary: "Publish flow",
          description: "Publishes the current draft version of a flow.",
        },
        {
          name: "schemas.flowSpec",
          summary: "Get flow spec schema",
          description:
            "Returns the JSON Schema for the flow spec DSL used by flows.create and flows.publish.",
        },
        { name: "flows.list", summary: "List flows" },
        { name: "flows.get", summary: "Get flow" },
        { name: "flows.create", summary: "Create flow" },
        { name: "flows.validate", summary: "Validate flow" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("Publish flow 15")[0]?.name).toBe("flows_publish")
  })

  test("stemming folds a plural query onto a singular tool name token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "flows.list", summary: "List flows" },
        { name: "products.list", summary: "List products" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("show flow")[0]?.name).toBe("flows_list")
  })

  test("resolves an email literal to the contact tool via its contact/email hint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "contacts.get", summary: "Get contact" },
        { name: "tags.get", summary: "Get tag" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("Find ada@example.com")[0]?.name).toBe("contacts_get")
  })

  test("a tag (resource group) match contributes when name/summary miss", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        {
          name: "contacts.refreshProfile",
          summary: "Refresh contact profile",
          tags: ["Contacts"],
        },
        {
          name: "flows.duplicate",
          summary: "Duplicate flow",
          tags: ["Flows"],
        },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("contacts")[0]?.name).toBe("contacts_refresh_profile")
  })
})
