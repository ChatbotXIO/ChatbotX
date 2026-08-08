import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockGet, mockGetWithHeaders } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockGetWithHeaders: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  instagramCoexistGraphClient: {
    get: mockGet,
    getWithHeaders: mockGetWithHeaders,
  },
}))

const { fetchInstagramConversationMessages, listInstagramConversations } =
  await import("../src/apis/sync")

describe("Instagram coexist sync API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists conversations from the native Instagram conversations edge", async () => {
    mockGetWithHeaders.mockResolvedValue({
      data: {
        data: [{ id: "conv-1", updated_time: "2026-08-01T10:00:00+0000" }],
        paging: { cursors: { after: "next-1" }, next: "https://next" },
      },
      headers: new Headers({
        "x-app-usage": JSON.stringify({ call_count: 12, total_time: 5 }),
      }),
    })

    const result = await listInstagramConversations({
      igUserId: "ig-1",
      accessToken: "token-1",
      version: "v22.0",
    })

    expect(mockGetWithHeaders).toHaveBeenCalledWith(
      "v22.0/ig-1/conversations",
      expect.objectContaining({
        headers: { Authorization: "Bearer token-1" },
        searchParams: expect.objectContaining({
          fields: "id,participants,updated_time",
        }),
      }),
    )
    expect(result.data).toEqual([
      { id: "conv-1", updated_time: "2026-08-01T10:00:00+0000" },
    ])
    expect(result.after).toBe("next-1")
    expect(result.appUsage?.call_count).toBe(12)
  })

  it("ignores malformed x-app-usage headers", async () => {
    mockGetWithHeaders.mockResolvedValue({
      data: { data: [{ id: "conv-1" }] },
      headers: new Headers({ "x-app-usage": "not-json" }),
    })

    const result = await listInstagramConversations({
      igUserId: "ig-1",
      accessToken: "token-1",
      version: "v22.0",
    })

    expect(result.data).toEqual([{ id: "conv-1" }])
    expect(result.appUsage).toBeNull()
  })

  it("parses nested messages.data and hydrates missing detail internally", async () => {
    mockGetWithHeaders.mockResolvedValue({
      data: {
        id: "conv-1",
        messages: {
          data: [{ id: "msg-1" }],
          paging: { cursors: { after: "next-msg" }, next: "https://next" },
        },
      },
      headers: new Headers(),
    })
    mockGet.mockResolvedValue({
      id: "msg-1",
      created_time: "2026-08-01T10:00:00+0000",
      from: { id: "user-1", username: "customer" },
      message: "hello",
    })

    const result = await fetchInstagramConversationMessages({
      conversationId: "conv-1",
      accessToken: "token-1",
      version: "v22.0",
    })

    expect(mockGetWithHeaders).toHaveBeenCalledWith(
      "v22.0/conv-1",
      expect.objectContaining({
        searchParams: {
          fields:
            "messages{id,created_time,from,to,message,attachments,is_unsupported}",
        },
      }),
    )
    expect(mockGet).toHaveBeenCalledWith(
      "v22.0/msg-1",
      expect.objectContaining({
        searchParams: expect.objectContaining({
          fields: "id,created_time,from,to,message,attachments,is_unsupported",
        }),
      }),
    )
    expect(result.data).toEqual([
      {
        id: "msg-1",
        created_time: "2026-08-01T10:00:00+0000",
        from: { id: "user-1", username: "customer" },
        message: "hello",
      },
    ])
    expect(result.after).toBe("next-msg")
  })

  it("keeps ref-only messages when detail hydration fails", async () => {
    mockGetWithHeaders.mockResolvedValue({
      data: {
        id: "conv-1",
        messages: { data: [{ id: "msg-1" }, { id: "msg-2" }] },
      },
      headers: new Headers(),
    })
    mockGet
      .mockRejectedValueOnce(new Error("detail unavailable"))
      .mockResolvedValueOnce({
        id: "msg-2",
        created_time: "2026-08-01T10:00:00+0000",
        from: { id: "user-1" },
        message: "ok",
      })

    const result = await fetchInstagramConversationMessages({
      conversationId: "conv-1",
      accessToken: "token-1",
      version: "v22.0",
    })

    expect(result.data).toEqual([
      { id: "msg-1" },
      {
        id: "msg-2",
        created_time: "2026-08-01T10:00:00+0000",
        from: { id: "user-1" },
        message: "ok",
      },
    ])
  })

  it("paginates the nested messages edge with a field-level cursor, not a top-level after", async () => {
    mockGetWithHeaders.mockResolvedValue({
      data: { id: "conv-1", messages: { data: [{ id: "msg-1" }] } },
      headers: new Headers(),
    })
    mockGet.mockResolvedValue({ id: "msg-1", message: "hi" })

    await fetchInstagramConversationMessages({
      conversationId: "conv-1",
      accessToken: "token-1",
      version: "v22.0",
      after: "CURSOR123",
    })

    const [, options] = mockGetWithHeaders.mock.calls[0] ?? []
    // Cursor must live inside the messages field modifier so the nested edge
    // actually advances; a top-level `after` param would be ignored and loop.
    expect(options?.searchParams.fields).toBe(
      "messages.after(CURSOR123){id,created_time,from,to,message,attachments,is_unsupported}",
    )
    expect(options?.searchParams).not.toHaveProperty("after")
  })
})
