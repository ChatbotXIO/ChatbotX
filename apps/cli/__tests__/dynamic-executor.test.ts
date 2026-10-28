import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { executeDynamicCommand } from "../src/dynamic-executor"
import type { DynamicTool } from "../src/openapi-loader"

const tool: DynamicTool = {
  baseUrl: "https://api.example.com",
  bodyParamNames: [],
  commandName: "contacts-list",
  description: "List contacts",
  inputSchema: { properties: {}, type: "object" },
  method: "GET",
  pathParamNames: [],
  pathTemplate: "/v1/contacts",
  queryParamNames: [],
}

const successfulResponse = {
  headers: { get: () => "application/json" },
  json: async () => ({ data: [] }),
  ok: true,
}

describe("executeDynamicCommand", () => {
  const originalFetch = globalThis.fetch
  const originalWrite = process.stdout.write.bind(process.stdout)

  beforeEach(() => {
    process.stdout.write = vi.fn(
      () => true,
    ) as unknown as typeof process.stdout.write
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.stdout.write = originalWrite
  })

  test("sends a JSON body for a DELETE command that declares body params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const deleteTool: DynamicTool = {
      ...tool,
      bodyParamNames: ["tagIds"],
      commandName: "contacts-remove-tags",
      inputSchema: {
        properties: { tagIds: { items: { type: "string" }, type: "array" } },
        type: "object",
      },
      method: "DELETE",
      pathParamNames: ["identifier"],
      pathTemplate: "/v1/contacts/{identifier}/tags",
    }

    await executeDynamicCommand(
      deleteTool,
      { identifier: "id:1", tagIds: '["1"]' },
      { apiKey: "api-key", apiUrl: "https://api.example.com" },
    )

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe("DELETE")
    expect(init.body).toBe(JSON.stringify({ tagIds: ["1"] }))
  })

  test("sends no body for a GET command even when query params are present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      queryParamNames: ["page"],
    }

    await executeDynamicCommand(
      getTool,
      { page: "2" },
      {
        apiKey: "api-key",
        apiUrl: "https://api.example.com",
      },
    )

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.body).toBeUndefined()
  })

  describe("the literal `null` flag value", () => {
    const patchTool = (property: Record<string, unknown>): DynamicTool => ({
      ...tool,
      bodyParamNames: ["currency"],
      commandName: "pipelines-update",
      inputSchema: { properties: { currency: property }, type: "object" },
      method: "PATCH",
      pathParamNames: ["id"],
      pathTemplate: "/v1/pipelines/{id}",
    })

    const sentBody = async (
      property: Record<string, unknown>,
      value: string,
    ) => {
      const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
      globalThis.fetch = fetchMock as unknown as typeof fetch
      await executeDynamicCommand(
        patchTool(property),
        { id: "1", currency: value },
        { apiKey: "api-key", apiUrl: "https://api.example.com" },
      )
      return (fetchMock.mock.calls[0]?.[1] as RequestInit).body
    }

    test.each([
      [
        "a null union member",
        { anyOf: [{ type: "string" }, { type: "null" }] },
      ],
      [
        "a oneOf null member",
        { oneOf: [{ type: "string" }, { type: "null" }] },
      ],
      ["a nullable flag", { type: "string", nullable: true }],
      ["a type list with null", { type: ["string", "null"] }],
    ])("is sent as JSON null when the property takes %s", async (_name, property) => {
      expect(await sentBody(property, "null")).toBe(
        JSON.stringify({ currency: null }),
      )
    })

    test('stays the text "null" when the property does not take null', async () => {
      expect(await sentBody({ type: "string" }, "null")).toBe(
        JSON.stringify({ currency: "null" }),
      )
    })

    test("any other value is still sent as text", async () => {
      expect(
        await sentBody(
          { anyOf: [{ type: "string" }, { type: "null" }] },
          "VND",
        ),
      ).toBe(JSON.stringify({ currency: "VND" }))
    })
  })
})
