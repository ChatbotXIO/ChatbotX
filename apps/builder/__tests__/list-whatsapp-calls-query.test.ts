// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  whatsappCallHistoryService: { list: mocks.list },
}))

const { encodeCursor } = await import("../src/lib/pagination")
const { InvalidWhatsappCallCursorError, listWhatsappCalls } = await import(
  "../src/features/whatsapp-calls/queries/list-whatsapp-calls.query"
)

const WORKSPACE_ID = "workspace-1"
const MEMBER = { userId: "user-1", permissions: { superAdmin: true } }

const historyRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "call-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  direction: "userInitiated",
  status: "completed",
  outcome: "completed",
  kind: "answeredInbound",
  durationSeconds: 30,
  recordingPath: null,
  conversationId: "conversation-1",
  contact: { id: "contact-1", fullName: "Jane", avatar: null },
  inbox: { id: "inbox-1", name: "Support" },
  answeredByUser: null,
  initiatedByUser: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue({ data: [], nextCursor: null })
})

describe("listWhatsappCalls — request adapter", () => {
  test("forwards workspaceId, member and activity to the service, with no cursor on the first page", async () => {
    await listWhatsappCalls(
      { workspaceId: WORKSPACE_ID, activity: "missed" },
      MEMBER,
    )

    expect(mocks.list).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      member: MEMBER,
      activity: "missed",
      inboxId: undefined,
      agentUserId: undefined,
      cursor: undefined,
    })
  })

  // inboxId/agentUserId flow straight through to the service, which
  // already scopes/ignores agentUserId.
  test("forwards inboxId and agentUserId to the service", async () => {
    await listWhatsappCalls(
      {
        workspaceId: WORKSPACE_ID,
        inboxId: "inbox-1",
        agentUserId: "agent-1",
      },
      MEMBER,
    )

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-1",
        agentUserId: "agent-1",
      }),
    )
  })

  test("decodes a valid opaque cursor and forwards it to the service", async () => {
    const cursor = encodeCursor({
      createdAt: "2026-01-01 00:00:00.123456+00",
      id: "999999999999999999",
    })

    await listWhatsappCalls({ workspaceId: WORKSPACE_ID, cursor }, MEMBER)

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: {
          createdAt: "2026-01-01 00:00:00.123456+00",
          id: "999999999999999999",
        },
      }),
    )
  })

  // A provided-but-corrupted cursor must never silently fall back to
  // page 1 (which would duplicate rows on the client) — it throws instead.
  test("throws InvalidWhatsappCallCursorError for a provided cursor that fails to decode, rather than silently starting from page 1", async () => {
    await expect(
      listWhatsappCalls(
        { workspaceId: WORKSPACE_ID, cursor: "not-a-valid-cursor" },
        MEMBER,
      ),
    ).rejects.toBeInstanceOf(InvalidWhatsappCallCursorError)

    expect(mocks.list).not.toHaveBeenCalled()
  })

  // LOW fix: a tampered cursor is a translated client 4xx, not a generic 500
  // — `InvalidWhatsappCallCursorError` must be a `ChatbotXException` so
  // `actionClient.handleServerError` (@/lib/safe-action) warn-logs it and
  // returns its message instead of `DEFAULT_SERVER_ERROR_MESSAGE`.
  test("InvalidWhatsappCallCursorError is a ChatbotXException with code invalidCursor and a 400 status", async () => {
    const { ChatbotXException } = await import("@chatbotx.io/business/errors")
    const error = new InvalidWhatsappCallCursorError()

    expect(error).toBeInstanceOf(ChatbotXException)
    expect(error.code).toBe("invalidCursor")
    expect(error.httpStatusCode).toBe(400)
  })

  test("an OMITTED cursor is the normal first page — no error, service called with cursor: undefined", async () => {
    await expect(
      listWhatsappCalls({ workspaceId: WORKSPACE_ID }, MEMBER),
    ).resolves.toBeDefined()

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: undefined }),
    )
  })

  test("shapes each row to the client-facing resource (explicit allow-list)", async () => {
    mocks.list.mockResolvedValueOnce({
      data: [historyRow()],
      nextCursor: null,
    })

    const result = await listWhatsappCalls(
      { workspaceId: WORKSPACE_ID },
      MEMBER,
    )

    expect(result.data).toEqual([
      {
        id: "call-1",
        createdAt: expect.any(Date),
        direction: "userInitiated",
        status: "completed",
        outcome: "completed",
        kind: "answeredInbound",
        durationSeconds: 30,
        recordingPath: null,
        conversationId: "conversation-1",
        contact: { id: "contact-1", fullName: "Jane", avatar: null },
        inbox: { id: "inbox-1", name: "Support" },
        answeredByUser: null,
        initiatedByUser: null,
      },
    ])
  })

  test("encodes the service's nextCursor for the client", async () => {
    mocks.list.mockResolvedValueOnce({
      data: [],
      nextCursor: { createdAt: "2026-01-01 00:00:00.123456+00", id: "call-9" },
    })

    const result = await listWhatsappCalls(
      { workspaceId: WORKSPACE_ID },
      MEMBER,
    )

    expect(typeof result.nextCursor).toBe("string")
    expect(result.nextCursor).not.toBeNull()
  })
})
