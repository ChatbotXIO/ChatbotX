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
})
