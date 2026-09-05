import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  isWorkspaceTokenOperation,
  loadOpenApiSpec,
  toSnakeCase,
} from "../src/openapi-loader"

describe("toSnakeCase", () => {
  test.each([
    ["tags.list", "tags_list"],
    ["aiAgents.list", "ai_agents_list"],
    ["contacts.listTags", "contacts_list_tags"],
    ["botFields.bulkUpdate", "bot_fields_bulk_update"],
    ["workspaceMembers.get", "workspace_members_get"],
    ["externalWebhooks.delete", "external_webhooks_delete"],
    ["contacts.findByCustomField", "contacts_find_by_custom_field"],
  ])("%s -> %s", (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected)
  })

  // Documented gap: a run of acronym-like segments (e.g. an `MCPServers`
  // resource) does not split the way a human would expect. Not exercised by
  // any current operationId — revisit if one is ever added.
  test.todo("aiMCPServers -> ai_mcpservers")
})

describe("isWorkspaceTokenOperation", () => {
  test("undefined security means the document-level workspace-token default applies", () => {
    expect(isWorkspaceTokenOperation({})).toBe(true)
  })

  test("a workspace-token scheme in the security array is true", () => {
    expect(
      isWorkspaceTokenOperation({
        security: [{ bearerAuth: [] }],
      }),
    ).toBe(true)
  })

  test("a channel-token-only scheme is false", () => {
    expect(
      isWorkspaceTokenOperation({
        security: [{ channelApiToken: [] }],
      }),
    ).toBe(false)
  })

  test("an empty security array (no auth) is false", () => {
    expect(isWorkspaceTokenOperation({ security: [] })).toBe(false)
  })
})

describe("loadOpenApiSpec", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("skips deprecated and non-workspace-token operations", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/v1/tags": {
            get: { operationId: "tags.list", summary: "List tags" },
          },
          "/v1/channels/api/messages": {
            post: {
              operationId: "channels.sendMessage",
              summary: "Send message",
              security: [{ channelApiToken: [] }],
            },
          },
          "/v1/channels": {
            get: {
              operationId: "inboxes.listChannels",
              summary: "List channels",
              deprecated: true,
            },
          },
        },
      }),
    }) as unknown as typeof fetch

    const tools = await loadOpenApiSpec()

    expect(tools.map((tool) => tool.name)).toEqual(["tags_list"])
  })
})
