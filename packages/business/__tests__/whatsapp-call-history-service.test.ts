import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listForWorkspace: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: { listForWorkspace: mocks.listForWorkspace },
}))

const {
  CALL_ACTIVITY_FILTERS,
  CALL_KIND_RULES,
  resolveCallKind,
  whatsappCallHistoryService,
} = await import("../src/whatsapp-call/history-service")

const WORKSPACE_ID = "workspace-1"
const USER_ID = "user-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listForWorkspace.mockResolvedValue([])
})

describe("CALL_KIND_RULES / resolveCallKind — first match wins", () => {
  test("ongoing: a non-terminal status wins regardless of outcome", () => {
    expect(
      resolveCallKind({
        status: "ringing",
        outcome: null,
        direction: "userInitiated",
      }),
    ).toBe("ongoing")
    expect(
      resolveCallKind({
        status: "accepted",
        outcome: null,
        direction: "userInitiated",
      }),
    ).toBe("ongoing")
  })

  test("canceled: coalesced outcome canceled", () => {
    expect(
      resolveCallKind({
        status: "failed",
        outcome: "canceled",
        direction: "businessInitiated",
      }),
    ).toBe("canceled")
  })

  test("declined: coalesced outcome rejected", () => {
    expect(
      resolveCallKind({
        status: "rejected",
        outcome: null,
        direction: "userInitiated",
      }),
    ).toBe("declined")
  })

  test("missed: failed + userInitiated (inbound call the business never answered)", () => {
    expect(
      resolveCallKind({
        status: "failed",
        outcome: "failed",
        direction: "userInitiated",
      }),
    ).toBe("missed")
  })

  test("unanswered: failed + businessInitiated (outbound call the customer never picked up)", () => {
    expect(
      resolveCallKind({
        status: "failed",
        outcome: null,
        direction: "businessInitiated",
      }),
    ).toBe("unanswered")
  })

  test("answeredInbound: completed + userInitiated", () => {
    expect(
      resolveCallKind({
        status: "completed",
        outcome: null,
        direction: "userInitiated",
      }),
    ).toBe("answeredInbound")
  })

  test("answeredOutbound: completed + businessInitiated", () => {
    expect(
      resolveCallKind({
        status: "completed",
        outcome: null,
        direction: "businessInitiated",
      }),
    ).toBe("answeredOutbound")
  })

  test("the rule table covers exactly the documented kinds, in order", () => {
    expect(CALL_KIND_RULES.map((rule) => rule.kind)).toEqual([
      "ongoing",
      "canceled",
      "declined",
      "missed",
      "unanswered",
      "answeredInbound",
      "answeredOutbound",
    ])
  })
})

describe("CALL_ACTIVITY_FILTERS — base chips", () => {
  test("missed chip filters failed + userInitiated", () => {
    expect(CALL_ACTIVITY_FILTERS.missed).toEqual({
      outcome: "failed",
      direction: "userInitiated",
    })
  })

  test("noReply chip filters failed + businessInitiated", () => {
    expect(CALL_ACTIVITY_FILTERS.noReply).toEqual({
      outcome: "failed",
      direction: "businessInitiated",
    })
  })
})

describe("whatsappCallHistoryService.list — scope translation", () => {
  test("superAdmin resolves to an unrestricted allCalls scope", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { allCalls: true } }),
    )
  })

  test("analytics-only resolves to an unrestricted allCalls scope", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { analytics: true } },
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { allCalls: true } }),
    )
  })

  test("contacts (non-admin) resolves to own-calls scope, not assignedOnly", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { contacts: true } },
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { allCalls: false, userId: USER_ID, assignedOnly: false },
      }),
    )
  })

  test("onlyAssignedContacts (non-admin, no contacts) resolves to assignedOnly scope", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: {
        userId: USER_ID,
        permissions: { onlyAssignedContacts: true },
      },
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { allCalls: false, userId: USER_ID, assignedOnly: true },
      }),
    )
  })

  test("a member with NONE of the four scope-granting permissions fails closed — empty result, no repository read", async () => {
    const result = await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: {} },
    })

    expect(result).toEqual({ data: [], nextCursor: null })
    expect(mocks.listForWorkspace).not.toHaveBeenCalled()
  })

  test("agentUserId filter is only forwarded for a privileged member — non-privileged caller's value still reaches the repository (repository enforces the D4 ignore rule, per its own tests)", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { contacts: true } },
      agentUserId: "agent-9",
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ agentUserId: "agent-9" }),
      }),
    )
  })

  test("an explicit direction input never overrides an active chip's direction — the chip wins", async () => {
    // `missed` implies `direction: userInitiated`; an explicit
    // `businessInitiated` must NOT flip it.
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
      activity: "missed",
      direction: "businessInitiated",
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ direction: "userInitiated" }),
      }),
    )
  })

  test("an explicit direction input applies as-is when no chip is active", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
      direction: "businessInitiated",
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ direction: "businessInitiated" }),
      }),
    )
  })

  test("an activity chip sets both outcome and direction filters", async () => {
    await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
      activity: "missed",
    })
    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          outcome: "failed",
          direction: "userInitiated",
        }),
      }),
    )
  })

  test("requests limit + 1 rows and reports nextCursor only when the extra row exists", async () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({
      id: `call-${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, i),
      // The full-precision TEXT form the repository returns alongside
      // `createdAt` — deliberately carries MORE precision than the `Date`
      // above (microseconds) to prove `nextCursor` is built from THIS
      // field, not from a `Date`-truncated round-trip of `createdAt`.
      createdAtCursor: `2026-01-01 00:00:${String(i).padStart(2, "0")}.123456+00`,
      status: "completed" as const,
      outcome: "completed" as const,
      direction: "userInitiated" as const,
    }))
    mocks.listForWorkspace.mockResolvedValueOnce(rows)

    const result = await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
    })

    expect(mocks.listForWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 26 }),
    )
    expect(result.data).toHaveLength(25)
    expect(result.nextCursor).toEqual({
      createdAt: rows[24].createdAtCursor,
      id: rows[24].id,
    })
  })

  test("no extra row means no nextCursor", async () => {
    mocks.listForWorkspace.mockResolvedValueOnce([
      {
        id: "call-1",
        createdAt: new Date(),
        status: "completed",
        outcome: "completed",
        direction: "userInitiated",
      },
    ])

    const result = await whatsappCallHistoryService.list({
      workspaceId: WORKSPACE_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
    })

    expect(result.nextCursor).toBeNull()
    expect(result.data).toHaveLength(1)
    expect(result.data[0].kind).toBe("answeredInbound")
  })
})
