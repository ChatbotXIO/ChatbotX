import {
  beforeEach,
  describe,
  expect,
  type MockInstance,
  test,
  vi,
} from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

// Dynamic imports ensure vi.mock is fully applied before loading these modules.
const api = await import("../src/apis/welcome-message-flows")
const { facebookGraphClient } = await import("../src/lib/http-client")
const mockPost = facebookGraphClient.post as MockInstance
const mockDelete = facebookGraphClient.delete as MockInstance
const mockGet = facebookGraphClient.get as MockInstance
const { MessengerAPIException } = await import("../src/exception")

/** Shaped like a ky `HTTPError` (ky matches on `name`). */
const httpError = (status: number, code?: number, subcode?: number) =>
  Object.assign(new Error(`HTTP ${status}`), {
    name: "HTTPError",
    response: { status },
    request: { url: "https://graph.facebook.com", method: "GET" },
    data: { error: { code, error_subcode: subcode, message: "graph" } },
  })
const graphException = (origin: unknown) =>
  new MessengerAPIException(
    "graph",
    400,
    undefined,
    undefined,
    undefined,
    origin,
  )

const ctx = {
  auth: {
    tokens: { accessToken: "page-token" },
    version: "v99.0",
    metadata: { pageId: "page-1", pageName: "Page", version: "v99.0" },
  },
} as never
const messages = [{ message: { text: "Hi" } }]
const endpoint = "v99.0/page-1/welcome_message_flows"
const headers = {
  "Content-Type": "application/json",
  Authorization: "Bearer page-token",
}

describe("welcome message flows API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("create posts name, stringified messages and the messenger platform", async () => {
    mockPost.mockResolvedValue({ flow_id: "123" })

    await expect(
      api.createWelcomeMessageFlow({ ctx, name: "Flow (v1)", messages }),
    ).resolves.toEqual({ flowId: "123" })
    expect(mockPost).toHaveBeenCalledWith(endpoint, {
      headers,
      json: {
        name: "Flow (v1)",
        welcome_message_flow: JSON.stringify(messages),
        eligible_platforms: ["messenger"],
      },
      retry: 0,
    })
  })

  test("update without messages sends only flow_id and name", async () => {
    mockPost.mockResolvedValue({ success: true })

    await api.updateWelcomeMessageFlow({
      ctx,
      flowId: "123",
      name: "Flow (v2)",
    })

    expect(mockPost).toHaveBeenCalledWith(endpoint, {
      headers,
      json: { flow_id: "123", name: "Flow (v2)" },
      retry: 0,
    })
  })

  test("update with messages also sends the payload and platforms", async () => {
    mockPost.mockResolvedValue({ success: true })

    await api.updateWelcomeMessageFlow({
      ctx,
      flowId: "123",
      name: "Flow (v2)",
      messages,
    })

    expect(mockPost.mock.calls[0][1].json).toEqual({
      flow_id: "123",
      name: "Flow (v2)",
      welcome_message_flow: JSON.stringify(messages),
      eligible_platforms: ["messenger"],
    })
  })

  test("delete sends flow_id", async () => {
    mockDelete.mockResolvedValue({ success: true })

    await api.deleteWelcomeMessageFlow({ ctx, flowId: "123" })

    expect(mockDelete).toHaveBeenCalledWith(endpoint, {
      headers,
      json: { flow_id: "123" },
      retry: 0,
    })
  })

  test("Graph errors propagate to the caller", async () => {
    mockPost.mockRejectedValue(new Error("flow is used in an ad"))

    await expect(
      api.updateWelcomeMessageFlow({ ctx, flowId: "1", name: "x", messages }),
    ).rejects.toThrow()
  })

  test("get reads one flow's ad usage by flow_id", async () => {
    mockGet.mockResolvedValue({ id: "123", is_used_in_ad: true })

    await expect(
      api.getWelcomeMessageFlow({ ctx, flowId: "123" }),
    ).resolves.toEqual({ id: "123", is_used_in_ad: true })
    expect(mockGet).toHaveBeenCalledWith(endpoint, {
      headers,
      searchParams: { flow_id: "123" },
      retry: 0,
    })
  })

  test("get unwraps a { data: [...] } response", async () => {
    mockGet.mockResolvedValue({ data: [{ id: "123", is_used_in_ad: false }] })

    await expect(
      api.getWelcomeMessageFlow({ ctx, flowId: "123" }),
    ).resolves.toEqual({ id: "123", is_used_in_ad: false })
  })

  test("get returns null for an empty response or a missing object", async () => {
    mockGet.mockResolvedValueOnce({ data: [] })
    await expect(
      api.getWelcomeMessageFlow({ ctx, flowId: "1" }),
    ).resolves.toBeNull()

    mockGet.mockRejectedValueOnce(graphException(httpError(400, 100, 33)))
    await expect(
      api.getWelcomeMessageFlow({ ctx, flowId: "1" }),
    ).resolves.toBeNull()
  })

  test("get propagates every other Graph error", async () => {
    mockGet.mockRejectedValue(graphException(httpError(500, 2)))

    await expect(
      api.getWelcomeMessageFlow({ ctx, flowId: "1" }),
    ).rejects.toThrow()
  })

  test.each([
    ["rate limit", httpError(400, 4), true],
    ["Meta 5xx", httpError(503), true],
    ["no response (timeout/network)", new Error("timeout"), true],
    ["invalid content", httpError(400, 100), false],
    ["revoked token", httpError(400, 190), false],
  ])("isTransient: %s → %s", (_label, origin, expected) => {
    expect(api.isTransientWelcomeMessageFlowError(graphException(origin))).toBe(
      expected,
    )
  })
})
