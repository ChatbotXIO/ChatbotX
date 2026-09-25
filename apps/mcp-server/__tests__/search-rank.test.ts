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

  test("ranks English action and resource queries first", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "contacts.update", summary: "Update contact" },
        { name: "contacts.list", summary: "List all contacts" },
        { name: "coupons.issue", summary: "Issue coupon" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("update contact")[0]?.name).toBe("contacts_update")
    expect(searchTools("list all contacts")[0]?.name).toBe("contacts_list")
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

  test("does not rank a create tool for a message query containing them", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "messages.send", summary: "Send message" },
        { name: "tags.create", summary: "Create tag" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(searchTools("send a message to them")[0]?.name).toBe("messages_send")
  })

  test("keeps ISO dates as date hints instead of contact phones", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        { name: "analytics.list", summary: "List analytics" },
        { name: "contacts.list", summary: "List contacts" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    expect(
      searchTools("analytics from 2026-09-01 to 2026-09-23")[0]?.name,
    ).toBe("analytics_list")
  })
})

describe("CJK tokenization", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // Regression for the Han-character tokenizer fix in `normalize.ts`: before
  // it, `[\p{L}\p{N}]+` had no word boundary inside a whitespace-free CJK
  // run, so an entire Chinese phrase collapsed into one opaque multi-
  // character token instead of one token per character -- silently
  // preventing any partial/per-character match against the catalog.
  test("a Chinese query matches on a shared substring, not just full-string equality", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      specWithTools([
        {
          name: "contacts.addTag",
          summary: "Add tag to contact",
          description: "给联系人加标签",
        },
        { name: "flows.list", summary: "List flows" },
      ]),
    ) as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const { searchTools } = await import("../src/server/meta-tools")

    // Query shares only some Han characters with the tool's description
    // ("给...加标签" vs "给联系人打标签") -- without character-level
    // tokenization these two strings share zero tokens and score 0.
    expect(searchTools("给联系人打标签")[0]?.name).toBe("contacts_add_tag")
  })
})
