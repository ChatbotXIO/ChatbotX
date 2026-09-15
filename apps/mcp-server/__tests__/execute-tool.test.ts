import { afterEach, describe, expect, test, vi } from "vitest"
import type { DynamicTool } from "../src/openapi-loader"
import { executeTool } from "../src/server/execute-tool"

const tool: DynamicTool = {
  alwaysVisible: false,
  annotations: {
    destructiveHint: false,
    idempotentHint: true,
    readOnlyHint: true,
  },
  baseUrl: "https://api.example.com",
  bodyParamNames: [],
  description: "List contacts",
  inputSchema: { properties: {}, type: "object" },
  method: "GET",
  name: "contacts_list",
  pathParamNames: [],
  pathTemplate: "/v1/contacts",
  queryParamNames: ["page", "include", "contactFilter"],
  visibility: "default",
}

const successfulResponse = {
  headers: { get: () => "application/json" },
  json: async () => ({ data: [] }),
  ok: true,
}

describe("executeTool", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("passes an AbortSignal timeout to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await executeTool(tool, {}, "api-key")

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    })
  })

  test("reports a timeout with the configured timeout duration", async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(
        new DOMException("Timed out", "TimeoutError"),
      ) as unknown as typeof fetch

    const result = await executeTool(tool, {}, "api-key")

    expect(result).toEqual({
      content: [{ text: "Request timed out after 30000ms", type: "text" }],
      isError: true,
    })
  })

  test("serializes nested query parameters with bracket notation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await executeTool(
      tool,
      {
        contactFilter: { operator: "and" },
        include: ["tags", "flows"],
        page: 2,
      },
      "api-key",
    )

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect([...requestedUrl.searchParams.entries()]).toEqual([
      ["page", "2"],
      ["include[0]", "tags"],
      ["include[1]", "flows"],
      ["contactFilter[operator]", "and"],
    ])
  })
})
