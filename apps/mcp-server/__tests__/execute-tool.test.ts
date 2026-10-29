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
  hitlPolicy: "none",
  inputSchema: { properties: {}, type: "object" },
  method: "GET",
  name: "contacts_list",
  pathParamNames: [],
  pathTemplate: "/v1/contacts",
  queryParamNames: ["page", "include", "contactFilter"],
  tags: ["Contacts"],
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

    await executeTool(tool, {}, { token: "api-key" })

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

    const result = await executeTool(tool, {}, { token: "api-key" })

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
      { token: "api-key" },
    )

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect([...requestedUrl.searchParams.entries()]).toEqual([
      ["page", "2"],
      ["include[0]", "tags"],
      ["include[1]", "flows"],
      ["contactFilter[operator]", "and"],
    ])
  })

  test("sends a JSON body for a DELETE tool that declares body params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const deleteTool: DynamicTool = {
      ...tool,
      bodyParamNames: ["tagIds"],
      inputSchema: {
        properties: { tagIds: { items: { type: "string" }, type: "array" } },
        type: "object",
      },
      method: "DELETE",
      name: "contacts_remove_tags",
      pathTemplate: "/v1/contacts/{identifier}/tags",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(
      deleteTool,
      { identifier: "id:1", tagIds: ["1"] },
      { token: "api-key" },
    )

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe("DELETE")
    expect(init.body).toBe(JSON.stringify({ tagIds: ["1"] }))
  })

  test("sends no body for a GET tool even when query params are present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await executeTool(tool, { page: 2 }, { token: "api-key" })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.body).toBeUndefined()
  })

  test("auto-prefixes a bare email identifier before building the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: "ada@example.com" }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain(encodeURIComponent("email:ada@example.com"))
  })

  test("auto-prefixes a bare phone identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: "+841234567890" }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain(encodeURIComponent("phone:+841234567890"))
  })

  test("auto-prefixes a local phone identifier", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: "0912345678" }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain(encodeURIComponent("phone:0912345678"))
  })

  test("auto-prefixes a bare numeric identifier as an id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: "123" }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain(encodeURIComponent("id:123"))
  })

  test("leaves an international phone number without a plus unprefixed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: "84912345678" }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain("/v1/contacts/84912345678")
  })

  test("leaves a non-string identifier unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: 42 }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain("/v1/contacts/42")
  })

  test("leaves an already-prefixed identifier untouched", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(
      getTool,
      { identifier: "email:ada@example.com" },
      "api-key",
    )

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain(encodeURIComponent("email:ada@example.com"))
  })

  test("leaves a display name identifier untouched so the API's real error surfaces", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ...successfulResponse,
      ok: false,
      json: async () => ({ error: "invalidIdentifier" }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const getTool: DynamicTool = {
      ...tool,
      name: "contacts_get",
      pathTemplate: "/v1/contacts/{identifier}",
      pathParamNames: ["identifier"],
      queryParamNames: [],
    }

    await executeTool(getTool, { identifier: "An" }, "api-key")

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain("/v1/contacts/An")
  })

  test("returns CONFIRMATION_REQUIRED without dispatching an unconfirmed mutation", async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const mutationTool: DynamicTool = {
      ...tool,
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        readOnlyHint: false,
      },
      bodyParamNames: ["name"],
      hitlPolicy: "confirm_diff",
      inputSchema: {
        properties: {
          _confirm: { type: "boolean" },
          name: { type: "string" },
        },
        required: ["name"],
        type: "object",
      },
      method: "POST",
      name: "tags_create",
      queryParamNames: [],
      pathTemplate: "/v1/tags",
    }

    const result = await executeTool(
      mutationTool,
      { name: "VIP" },
      {
        token: "api-key",
      },
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      policy: "confirm_diff",
      proposed: { name: "VIP" },
    })
  })

  test("dispatches a confirmed mutation without forwarding _confirm", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const mutationTool: DynamicTool = {
      ...tool,
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        readOnlyHint: false,
      },
      bodyParamNames: ["name"],
      hitlPolicy: "confirm_diff",
      inputSchema: {
        properties: {
          _confirm: { type: "boolean" },
          name: { type: "string" },
        },
        required: ["name"],
        type: "object",
      },
      method: "POST",
      name: "tags_create",
      queryParamNames: [],
      pathTemplate: "/v1/tags",
    }

    await executeTool(
      mutationTool,
      { _confirm: true, name: "VIP" },
      { token: "api-key" },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/tags",
      expect.objectContaining({ body: JSON.stringify({ name: "VIP" }) }),
    )
  })

  test("dispatches after form elicitation is accepted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await executeTool(
      {
        ...tool,
        annotations: {
          destructiveHint: false,
          idempotentHint: false,
          readOnlyHint: false,
        },
        bodyParamNames: ["name"],
        hitlPolicy: "confirm_diff",
        method: "POST",
        name: "tags_create",
        pathTemplate: "/v1/tags",
      },
      { name: "VIP" },
      { token: "api-key" },
      {
        elicitationClient: {
          elicitInput: (request) => {
            expect(request.requestedSchema).toEqual({
              additionalProperties: false,
              properties: {},
              type: "object",
            })
            return Promise.resolve({ action: "accept" })
          },
          supportsFormElicitation: () => true,
        },
      },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/tags",
      expect.objectContaining({ body: JSON.stringify({ name: "VIP" }) }),
    )
  })

  test("does not dispatch when elicitation is declined", async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const result = await executeTool(
      {
        ...tool,
        annotations: {
          destructiveHint: true,
          idempotentHint: false,
          readOnlyHint: false,
        },
        hitlPolicy: "confirm_destructive",
        method: "DELETE",
        name: "tags_delete",
      },
      {},
      { token: "api-key" },
      {
        elicitationClient: {
          elicitInput: async () => ({ action: "decline" }),
          supportsFormElicitation: () => true,
        },
      },
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      code: "CONFIRMATION_DECLINED",
    })
  })

  test("reports the elicitation cancellation action without dispatching", async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await executeTool(
      {
        ...tool,
        annotations: {
          destructiveHint: true,
          idempotentHint: false,
          readOnlyHint: false,
        },
        hitlPolicy: "confirm_destructive",
        method: "DELETE",
        name: "tags_delete",
      },
      {},
      { token: "api-key" },
      {
        elicitationClient: {
          elicitInput: async () => ({ action: "cancel" }),
          supportsFormElicitation: () => true,
        },
      },
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      action: "cancel",
      code: "CONFIRMATION_DECLINED",
    })
  })

  test("reports elicitation failures without dispatching", async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await executeTool(
      {
        ...tool,
        annotations: {
          destructiveHint: false,
          idempotentHint: false,
          readOnlyHint: false,
        },
        hitlPolicy: "confirm_diff",
        method: "POST",
        name: "tags_create",
      },
      { name: "VIP" },
      { token: "api-key" },
      {
        elicitationClient: {
          elicitInput: () => Promise.reject(new Error("Request timed out")),
          supportsFormElicitation: () => true,
        },
      },
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.content[0]?.text).toBe(
      "Confirmation failed: Request timed out",
    )
  })

  test("elicits even when a form-capable client supplies _confirm", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    const elicitInput = vi.fn().mockResolvedValue({ action: "accept" })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await executeTool(
      {
        ...tool,
        annotations: {
          destructiveHint: false,
          idempotentHint: false,
          readOnlyHint: false,
        },
        bodyParamNames: ["name"],
        hitlPolicy: "confirm_diff",
        method: "POST",
        name: "tags_create",
        pathTemplate: "/v1/tags",
      },
      { _confirm: true, name: "VIP" },
      { token: "api-key" },
      {
        elicitationClient: {
          elicitInput,
          supportsFormElicitation: () => true,
        },
      },
    )

    expect(elicitInput).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/tags",
      expect.objectContaining({ body: JSON.stringify({ name: "VIP" }) }),
    )
  })

  test("removes _confirm from read-only query arguments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse)
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await executeTool(
      { ...tool, queryParamNames: ["page"] },
      { _confirm: true, page: 2 },
      { token: "api-key" },
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/v1/contacts?page=2",
      expect.anything(),
    )
  })

  test("uses only matching path parameters for current state and reports unavailable reads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        headers: { get: () => null },
        json: async () => ({
          servers: [{ url: "https://api.example.com" }],
          paths: {
            "/v1/tags/{id}": {
              get: { operationId: "tags.get", summary: "Get tag" },
            },
          },
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
        headers: { get: () => "application/json" },
        json: async () => ({ id: "tag-1", name: "VIP" }),
        ok: true,
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { loadOpenApiSpec } = await import("../src/openapi-loader")
    await loadOpenApiSpec()
    const deleteTool: DynamicTool = {
      ...tool,
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        readOnlyHint: false,
      },
      hitlPolicy: "confirm_destructive",
      method: "DELETE",
      name: "tags_delete",
      pathParamNames: ["id"],
      pathTemplate: "/v1/tags/{id}",
      queryParamNames: ["search"],
    }

    const stateResult = await executeTool(
      deleteTool,
      { id: "tag-1", search: "should-not-forward" },
      { token: "api-key" },
    )

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.example.com/v1/tags/tag-1",
      expect.objectContaining({ method: "GET" }),
    )
    expect(JSON.parse(stateResult.content[0]?.text ?? "{}")).toMatchObject({
      currentState: { id: "tag-1", name: "VIP" },
    })

    fetchMock.mockClear()
    const createResult = await executeTool(
      {
        ...tool,
        annotations: {
          destructiveHint: false,
          idempotentHint: false,
          readOnlyHint: false,
        },
        hitlPolicy: "confirm_diff",
        method: "POST",
        name: "tags_create",
        pathTemplate: "/v1/tags",
      },
      {},
      { token: "api-key" },
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.parse(createResult.content[0]?.text ?? "{}")).toMatchObject({
      currentStateUnavailable: "no read operation",
    })

    fetchMock.mockResolvedValueOnce({
      headers: { get: () => "application/json" },
      json: async () => ({ error: "Forbidden" }),
      ok: false,
      status: 403,
    })
    const unavailableResult = await executeTool(
      deleteTool,
      { id: "tag-1" },
      { token: "api-key" },
    )
    expect(
      JSON.parse(unavailableResult.content[0]?.text ?? "{}"),
    ).toMatchObject({
      currentStateUnavailable: "Error 403",
    })

    fetchMock.mockResolvedValueOnce({
      headers: { get: () => "text/plain" },
      ok: true,
      text: async () => "not JSON",
    })
    const nonJsonResult = await executeTool(
      deleteTool,
      { id: "tag-1" },
      { token: "api-key" },
    )
    expect(JSON.parse(nonJsonResult.content[0]?.text ?? "{}")).toMatchObject({
      currentStateUnavailable: "non-JSON body",
    })
  })
})
