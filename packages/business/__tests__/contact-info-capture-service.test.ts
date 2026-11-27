import type { ContactInfoType } from "@chatbotx.io/database/partials"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dbTransaction: vi.fn(),
  findConversation: vi.fn(),
  insert: vi.fn(),
  listOutgoingBefore: vi.fn(),
  lockRecipientForAttribution: vi.fn(),
  lockWorkspaceForChildWrite: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.dbTransaction },
}))
vi.mock("@chatbotx.io/database/repositories/workspace", () => ({
  workspaceRepository: {
    lockWorkspaceForChildWrite: mocks.lockWorkspaceForChildWrite,
  },
}))
vi.mock("@chatbotx.io/database/repositories/contact-info-capture", () => ({
  contactInfoCaptureRepository: {
    insert: mocks.insert,
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: {
    lockRecipientForAttribution: mocks.lockRecipientForAttribution,
  },
}))
vi.mock("../src/message/service", () => ({
  messageService: { listOutgoingBefore: mocks.listOutgoingBefore },
}))
vi.mock("../src/conversation/service", () => ({
  conversationService: { findByUncached: mocks.findConversation },
}))

const {
  CONTACT_INFO_CAPTURE_MAX_RUNS,
  CONTACT_INFO_CAPTURE_PAGE_SIZE,
  CONVERSATION_START_SKEW_MARGIN_MS,
  contactInfoCaptureService,
} = await import("../src/contact-info-capture/service")

const DAY_MS = 24 * 60 * 60 * 1000
const inbound = { createdAt: new Date("2026-06-01T00:00:00Z"), id: "5000" }
const tx = { tag: "tx" }
const search = {
  conversationId: "conv1",
  inboundMessage: inbound,
  workspaceId: "ws1",
}

const botMessage = (
  id: string,
  contentAttributes: Record<string, unknown>,
) => ({
  contentAttributes,
  createdAtExact: "2026-05-31T12:00:00.123456Z",
  id,
})
const broadcastMsg = (id = "100", flowId = "5") =>
  botMessage(id, {
    flowId,
    metadata: { broadcastId: "77", contactInboxId: "9", type: "broadcast" },
  })
const filler = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    botMessage(String(900 - index), { flowId: "5" }),
  )

describe("contactInfoCaptureService.findAttribution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listOutgoingBefore.mockResolvedValue([])
  })

  test("reads the first window below the inbound tuple and attributes", async () => {
    mocks.listOutgoingBefore.mockResolvedValue([broadcastMsg()])

    const result = await contactInfoCaptureService.findAttribution(search)

    expect(result).toEqual({
      followedFlowId: undefined,
      outcome: "attributed",
      sourceId: "77",
      sourceType: "broadcast",
    })
    expect(mocks.listOutgoingBefore).toHaveBeenCalledTimes(1)
    expect(mocks.listOutgoingBefore).toHaveBeenCalledWith({
      before: { createdAt: inbound.createdAt.toISOString(), id: "5000" },
      conversationId: "conv1",
      limit: CONTACT_INFO_CAPTURE_PAGE_SIZE,
      since: new Date(inbound.createdAt.getTime() - DAY_MS),
      workspaceId: "ws1",
    })
    expect(mocks.findConversation).not.toHaveBeenCalled()
  })

  test("decides none when the latest bot content belongs to nothing", async () => {
    mocks.listOutgoingBefore.mockResolvedValue([
      botMessage("101", { text: "ai" }),
      broadcastMsg(),
    ])

    expect(await contactInfoCaptureService.findAttribution(search)).toEqual({
      outcome: "none",
      reason: "noBotSource",
    })
  })

  test("a full page of continuations stays in the window and resumes before its last message", async () => {
    const page = filler(CONTACT_INFO_CAPTURE_PAGE_SIZE)
    mocks.listOutgoingBefore.mockResolvedValue(page)

    const result = await contactInfoCaptureService.findAttribution(search)

    expect(result).toEqual({
      cursor: {
        before: {
          // Microsecond-exact text, not a millisecond Date round trip.
          createdAt: "2026-05-31T12:00:00.123456Z",
          id: page.at(-1)?.id,
        },
        followedFlowId: "5",
        run: 1,
        windowIndex: 0,
      },
      outcome: "continue",
    })
  })

  test("a short page moves to the next non-overlapping window", async () => {
    mocks.listOutgoingBefore.mockResolvedValue(filler(2))

    const result = await contactInfoCaptureService.findAttribution(search)

    const firstSince = new Date(inbound.createdAt.getTime() - DAY_MS)
    expect(result).toEqual({
      cursor: {
        before: { createdAt: firstSince.toISOString(), id: "0" },
        followedFlowId: "5",
        run: 1,
        windowIndex: 1,
      },
      outcome: "continue",
    })
  })

  test("the next run reads the 7-day window strictly below the previous lower bound and keeps the followed flow", async () => {
    const firstSince = new Date(inbound.createdAt.getTime() - DAY_MS)
    mocks.listOutgoingBefore.mockResolvedValue([broadcastMsg("100", "5")])

    const result = await contactInfoCaptureService.findAttribution({
      ...search,
      cursor: {
        before: { createdAt: firstSince.toISOString(), id: "0" },
        followedFlowId: "5",
        run: 1,
        windowIndex: 1,
      },
    })

    expect(mocks.listOutgoingBefore).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { createdAt: firstSince.toISOString(), id: "0" },
        since: new Date(inbound.createdAt.getTime() - 7 * DAY_MS),
      }),
    )
    expect(result).toMatchObject({
      followedFlowId: "5",
      outcome: "attributed",
      sourceId: "77",
    })
  })

  test("the last window starts at the conversation's first message", async () => {
    const conversationStart = new Date("2024-01-01T00:00:00Z")
    mocks.findConversation.mockResolvedValue({ createdAt: conversationStart })

    await contactInfoCaptureService.findAttribution({
      ...search,
      cursor: {
        before: { createdAt: "2025-12-01T00:00:00.000Z", id: "0" },
        run: 4,
        windowIndex: 4,
      },
    })

    expect(mocks.findConversation).toHaveBeenCalledWith({
      where: { id: "conv1", workspaceId: "ws1" },
    })
    expect(mocks.listOutgoingBefore).toHaveBeenCalledWith(
      expect.objectContaining({ since: conversationStart }),
    )
  })

  test("end of history is none", async () => {
    mocks.findConversation.mockResolvedValue({
      createdAt: new Date("2024-01-01T00:00:00Z"),
    })

    expect(
      await contactInfoCaptureService.findAttribution({
        ...search,
        cursor: {
          before: { createdAt: "2025-12-01T00:00:00.000Z", id: "0" },
          run: 4,
          windowIndex: 4,
        },
      }),
    ).toEqual({ outcome: "none", reason: "historyExhausted" })
  })

  test("a missing conversation ends the search", async () => {
    mocks.findConversation.mockResolvedValue(undefined)

    expect(
      await contactInfoCaptureService.findAttribution({
        ...search,
        cursor: {
          before: { createdAt: "2025-12-01T00:00:00.000Z", id: "0" },
          run: 4,
          windowIndex: 4,
        },
      }),
    ).toEqual({ outcome: "none", reason: "historyExhausted" })
    expect(mocks.listOutgoingBefore).not.toHaveBeenCalled()
  })

  describe("with the conversation's creation time carried by the job", () => {
    const young = new Date(inbound.createdAt.getTime() - 5 * 60_000)

    test("a young conversation with no bot message ends after one run, without reading the conversation", async () => {
      mocks.listOutgoingBefore.mockResolvedValue([])

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: young,
      })

      expect(result).toEqual({ outcome: "none", reason: "historyExhausted" })
      expect(mocks.listOutgoingBefore).toHaveBeenCalledTimes(1)
      expect(mocks.findConversation).not.toHaveBeenCalled()
    })

    test("clamps the first window to the conversation start minus the skew margin", async () => {
      await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: young,
      })

      expect(mocks.listOutgoingBefore).toHaveBeenCalledWith(
        expect.objectContaining({
          since: new Date(young.getTime() - CONVERSATION_START_SKEW_MARGIN_MS),
        }),
      )
    })

    test("a broadcast message stamped before its own conversation (clock skew) is still found", async () => {
      const created = new Date(inbound.createdAt.getTime() - 60_000)
      // The page the repository would return for the margin-widened window.
      mocks.listOutgoingBefore.mockResolvedValue([broadcastMsg()])

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: created,
      })

      expect(result).toMatchObject({
        outcome: "attributed",
        sourceId: "77",
      })
      const since = mocks.listOutgoingBefore.mock.calls[0]?.[0].since as Date
      // 50 ms before the conversation start is inside the window read.
      expect(since.getTime()).toBeLessThan(created.getTime() - 50)
    })

    test("a carried start slightly after the inbound message is still used", async () => {
      mocks.listOutgoingBefore.mockResolvedValue([])
      const created = new Date(inbound.createdAt.getTime() + 1000)

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: created,
      })

      expect(mocks.listOutgoingBefore).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({ outcome: "none" })
    })

    test("a carried start more than the margin after the inbound message is ignored", async () => {
      mocks.listOutgoingBefore.mockResolvedValue(filler(2))

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: new Date(
          inbound.createdAt.getTime() +
            CONVERSATION_START_SKEW_MARGIN_MS +
            1000,
        ),
      })

      expect(mocks.listOutgoingBefore).toHaveBeenCalledWith(
        expect.objectContaining({
          since: new Date(inbound.createdAt.getTime() - DAY_MS),
        }),
      )
      expect(result).toMatchObject({
        cursor: { windowIndex: 1 },
        outcome: "continue",
      })
    })

    test("a conversation older than the first window keeps walking", async () => {
      mocks.listOutgoingBefore.mockResolvedValue(filler(2))
      const old = new Date(inbound.createdAt.getTime() - 400 * DAY_MS)

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: old,
      })

      const firstSince = new Date(inbound.createdAt.getTime() - DAY_MS)
      expect(mocks.listOutgoingBefore).toHaveBeenCalledWith(
        expect.objectContaining({ since: firstSince }),
      )
      expect(result).toMatchObject({
        cursor: { windowIndex: 1 },
        outcome: "continue",
      })
    })

    test("a full page in a clamped window still continues in the same window", async () => {
      mocks.listOutgoingBefore.mockResolvedValue(
        filler(CONTACT_INFO_CAPTURE_PAGE_SIZE),
      )

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: young,
      })

      expect(result).toMatchObject({
        cursor: { windowIndex: 0 },
        outcome: "continue",
      })
    })

    test("the last window starts at the carried start, with no conversation read", async () => {
      const start = new Date("2024-01-01T00:00:00Z")

      await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: start,
        cursor: {
          before: { createdAt: "2025-12-01T00:00:00.000Z", id: "0" },
          run: 4,
          windowIndex: 4,
        },
      })

      expect(mocks.findConversation).not.toHaveBeenCalled()
      expect(mocks.listOutgoingBefore).toHaveBeenCalledWith(
        expect.objectContaining({
          since: new Date(start.getTime() - CONVERSATION_START_SKEW_MARGIN_MS),
        }),
      )
    })

    test("a window in the middle that reaches the conversation start ends the search", async () => {
      mocks.listOutgoingBefore.mockResolvedValue(filler(2))
      // Created 10 days before the message: the 30-day window is clamped to it.
      const start = new Date(inbound.createdAt.getTime() - 10 * DAY_MS)

      const result = await contactInfoCaptureService.findAttribution({
        ...search,
        conversationCreatedAt: start,
        cursor: {
          before: {
            createdAt: new Date(
              inbound.createdAt.getTime() - 7 * DAY_MS,
            ).toISOString(),
            id: "0",
          },
          followedFlowId: "5",
          run: 2,
          windowIndex: 2,
        },
      })

      expect(result).toEqual({ outcome: "none", reason: "historyExhausted" })
    })
  })

  test("stops at the run cap without reading", async () => {
    expect(
      await contactInfoCaptureService.findAttribution({
        ...search,
        cursor: {
          before: { createdAt: inbound.createdAt.toISOString(), id: "1" },
          run: CONTACT_INFO_CAPTURE_MAX_RUNS,
          windowIndex: 0,
        },
      }),
    ).toEqual({ outcome: "none", reason: "runCapReached" })
    expect(mocks.listOutgoingBefore).not.toHaveBeenCalled()
  })

  test("a read failure propagates so the job retries", async () => {
    mocks.listOutgoingBefore.mockRejectedValue(new Error("shard down"))

    await expect(
      contactInfoCaptureService.findAttribution(search),
    ).rejects.toThrow("shard down")
  })
})

describe("contactInfoCaptureService.record", () => {
  const input = {
    capturedAt: inbound.createdAt,
    contactId: "c1",
    contactInboxId: "ci1",
    conversationId: "conv1",
    followedFlowId: "5",
    inboxId: "inbox1",
    infoTypes: ["phone", "email"] satisfies ContactInfoType[],
    sourceId: "77",
    sourceType: "broadcast" as const,
    workspaceId: "ws1",
  }
  const delivered = { deliveredAt: new Date(), failedAt: null }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx))
    mocks.lockWorkspaceForChildWrite.mockResolvedValue(true)
    mocks.lockRecipientForAttribution.mockResolvedValue(delivered)
    mocks.insert.mockResolvedValue(2)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("locks workspace, then broadcast, then inserts, in one transaction", async () => {
    const order: string[] = []
    mocks.lockWorkspaceForChildWrite.mockImplementation(() => {
      order.push("workspace")
      return Promise.resolve(true)
    })
    mocks.lockRecipientForAttribution.mockImplementation(() => {
      order.push("broadcast")
      return Promise.resolve(delivered)
    })
    mocks.insert.mockImplementation(() => {
      order.push("insert")
      return Promise.resolve(2)
    })

    expect(await contactInfoCaptureService.record(input)).toBe("recorded")

    expect(order).toEqual(["workspace", "broadcast", "insert"])
    expect(mocks.dbTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.lockRecipientForAttribution).toHaveBeenCalledWith(
      {
        broadcastId: "77",
        contactId: "c1",
        flowId: "5",
        workspaceId: "ws1",
      },
      tx,
    )
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        capturedAt: inbound.createdAt,
        infoTypes: ["phone", "email"],
        sourceId: "77",
      }),
      tx,
    )
  })

  test("a workspace being purged writes nothing", async () => {
    mocks.lockWorkspaceForChildWrite.mockResolvedValue(false)

    expect(await contactInfoCaptureService.record(input)).toBe(
      "workspaceUnavailable",
    )
    expect(mocks.lockRecipientForAttribution).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("a source the lock refuses (deleted, draft, other flow or not a recipient) is not attributable", async () => {
    mocks.lockRecipientForAttribution.mockResolvedValue(null)

    expect(await contactInfoCaptureService.record(input)).toBe(
      "sourceNotAttributable",
    )
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("a recipient neither delivered nor failed yet waits for a retry", async () => {
    mocks.lockRecipientForAttribution.mockResolvedValue({
      deliveredAt: null,
      failedAt: null,
    })

    expect(await contactInfoCaptureService.record(input)).toBe(
      "recipientPending",
    )
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("a recipient that only failed is dropped", async () => {
    mocks.lockRecipientForAttribution.mockResolvedValue({
      deliveredAt: null,
      failedAt: new Date(),
    })

    expect(await contactInfoCaptureService.record(input)).toBe(
      "recipientFailed",
    )
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("delivered wins when a failure was recorded too", async () => {
    mocks.lockRecipientForAttribution.mockResolvedValue({
      deliveredAt: new Date(),
      failedAt: new Date(),
    })

    expect(await contactInfoCaptureService.record(input)).toBe("recorded")
  })

  test("a duplicate capture is reported as already recorded", async () => {
    mocks.insert.mockResolvedValue(0)

    expect(await contactInfoCaptureService.record(input)).toBe(
      "alreadyRecorded",
    )
  })

  test("an insert failure propagates so the job retries", async () => {
    mocks.insert.mockRejectedValue(new Error("deadlock"))

    await expect(contactInfoCaptureService.record(input)).rejects.toThrow(
      "deadlock",
    )
  })
})
