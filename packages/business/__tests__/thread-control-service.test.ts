import {
  eventsOutrankedBy,
  THREAD_CONTROL_INBOX_ACTIVE_MS,
  THREAD_CONTROL_SEEN_REFRESH_MS,
  THREAD_CONTROL_TRANSITIONS,
  type ThreadControlEvent,
} from "@chatbotx.io/database/partials"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  applyThreadControlTransition: vi.fn(),
  findModelByIdForWorkspace: vi.fn(),
  listThreadControlledByContactIds: vi.fn(),
  setStandbyThreadOwnerExpiresAt: vi.fn(),
  promoteStandbyToOwnerDelivery: vi.fn(),
  touchThreadControlSeen: vi.fn(),
  createOrUpdate: vi.fn(),
  claimContentAttributes: vi.fn(),
  createMessageRepository: vi.fn(),
  publishToWorkspaceParty: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  enqueueIntegrationJob: vi.fn(),
  loggerWarn: vi.fn(),
  bulkUpdateTracking: vi.fn(),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { bulkUpdateTracking: mocks.bulkUpdateTracking },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    applyThreadControlTransition: mocks.applyThreadControlTransition,
    findModelByIdForWorkspace: mocks.findModelByIdForWorkspace,
    listThreadControlledByContactIds: mocks.listThreadControlledByContactIds,
    setStandbyThreadOwnerExpiresAt: mocks.setStandbyThreadOwnerExpiresAt,
    promoteStandbyToOwnerDelivery: mocks.promoteStandbyToOwnerDelivery,
  },
  inboxRepository: { touchThreadControlSeen: mocks.touchThreadControlSeen },
  createMessageRepository: mocks.createMessageRepository,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: {
    threadControlAction: "threadControlAction",
  },
  enqueueIntegrationJob: mocks.enqueueIntegrationJob,
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  publishToWorkspaceParty: mocks.publishToWorkspaceParty,
}))

vi.mock("../src/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: vi.fn(), info: vi.fn() },
}))

const { threadControlService } = await import("../src/thread-control/service")
const { toThreadControlTimestamp } = await import(
  "@chatbotx.io/database/partials"
)

const NOW = new Date("2026-09-29T12:00:00.000Z")
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms)

const makeContactInbox = (
  overrides: Partial<ContactInboxModel> = {},
): ContactInboxModel =>
  ({
    id: "ci-1",
    contactId: "contact-1",
    inboxId: "inbox-1",
    threadControlState: null,
    threadOwnerRole: null,
    threadControlUpdatedAt: null,
    threadControlLastEvent: null,
    lastIncomingMessageAt: null,
    ...overrides,
  }) as ContactInboxModel

const inbox = (seenAt: Date | null = null) => ({
  id: "inbox-1",
  threadControlSeenAt: seenAt,
})

const appliedRow = (
  event: ThreadControlEvent,
  role: string | null,
  occurredAt: Date,
) => ({
  id: "ci-1",
  threadControlState: THREAD_CONTROL_TRANSITIONS[event],
  threadOwnerRole: role,
  threadControlUpdatedAt: occurredAt,
  threadControlLastEvent: event,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  mocks.createMessageRepository.mockResolvedValue({
    createOrUpdate: mocks.createOrUpdate,
    claimContentAttributes: mocks.claimContentAttributes,
  })
  mocks.createOrUpdate.mockImplementation((input: { id: string }) =>
    Promise.resolve({ message: { ...input }, isNew: true }),
  )
  mocks.touchThreadControlSeen.mockResolvedValue(true)
  mocks.enqueueIntegrationJob.mockResolvedValue(undefined)
  mocks.bulkUpdateTracking.mockResolvedValue(null)
})

describe("threadControlService.recordEvent — lastMessageAt bump", () => {
  const record = (contactInbox: ContactInboxModel, occurredAt: Date) => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("controlTaken", "ai_agent", occurredAt),
    )
    return threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(NOW),
      contactInbox,
      conversationId: "conv-1",
      event: "controlTaken",
      ownerRole: "ai_agent",
      occurredAt,
    })
  }

  test("a new divider newer than lastMessageAt moves it forward (atomic GREATEST write)", async () => {
    const firstInteractionAt = ago(DAY)
    await record(
      makeContactInbox({
        lastMessageAt: ago(2 * HOUR),
        firstInteractionAt,
      } as Partial<ContactInboxModel>),
      NOW,
    )

    expect(mocks.bulkUpdateTracking).toHaveBeenCalledWith({
      rows: [
        {
          contactInboxId: "ci-1",
          contactId: "contact-1",
          workspaceId: "ws-1",
          firstInteractionAt,
          lastMessageAt: NOW,
          lastIncomingMessageAt: null,
        },
      ],
    })
  })

  test("an older routing row never moves lastMessageAt backwards", async () => {
    await record(
      makeContactInbox({ lastMessageAt: NOW } as Partial<ContactInboxModel>),
      ago(HOUR),
    )

    expect(mocks.bulkUpdateTracking).not.toHaveBeenCalled()
  })

  test("a redelivered divider (not new) does not bump", async () => {
    mocks.createOrUpdate.mockImplementation((input: { id: string }) =>
      Promise.resolve({ message: { ...input }, isNew: false }),
    )
    await record(
      makeContactInbox({
        lastMessageAt: ago(2 * HOUR),
      } as Partial<ContactInboxModel>),
      NOW,
    )

    expect(mocks.bulkUpdateTracking).not.toHaveBeenCalled()
  })

  test("a failed bump is logged and does not fail the event", async () => {
    mocks.bulkUpdateTracking.mockRejectedValue(new Error("db down"))

    const result = await record(
      makeContactInbox({
        lastMessageAt: ago(2 * HOUR),
      } as Partial<ContactInboxModel>),
      NOW,
    )

    expect(result.eventApplied).toBe(true)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })
})

describe("threadControlService.recordEvent", () => {
  test("applies a guarded transition with the parsed role and reports a state change", async () => {
    const occurredAt = ago(1000)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("controlTaken", "ai_agent", occurredAt),
    )

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(DAY / 2),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "controlTaken",
      ownerRole: "ai_agent",
      occurredAt,
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith({
      id: "ci-1",
      workspaceId: "ws-1",
      event: "controlTaken",
      ownerRole: "ai_agent",
      // Role-based channel: no app ids, written as null (inert for WhatsApp).
      ownerAppId: null,
      previousOwnerAppId: null,
      // New standby session (the thread was `owned` before): any stale expiry is
      // cleared rather than inherited.
      threadOwnerExpiresAt: null,
      occurredAt,
    })
    expect(result).toMatchObject({ eventApplied: true, stateChanged: true })
  })

  test("a continuing standby session keeps its stored expiry, a new one clears it", async () => {
    const occurredAt = ago(1000)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", "ai_agent", occurredAt),
    )

    // Same standby owner as before → stored expiry is kept (`undefined` = no
    // change in the guarded write).
    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerAppId: "622851382610562",
        threadControlUpdatedAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "standbyReceived",
      ownerRole: "ai_agent",
      ownerAppId: "622851382610562",
      occurredAt,
    })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadOwnerExpiresAt: undefined }),
    )

    // Different owner now → a new session, so the previous session's (possibly
    // expired) expiry must be cleared.
    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerAppId: "111222333444555",
        threadControlUpdatedAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "standbyReceived",
      ownerRole: "ai_agent",
      ownerAppId: "622851382610562",
      occurredAt,
    })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadOwnerExpiresAt: null }),
    )

    // Same owner, but the stored standby already EXPIRED (it resolves to idle):
    // that is a new session too, so the stale expiry is cleared rather than kept.
    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerAppId: "622851382610562",
        threadOwnerExpiresAt: ago(HOUR),
        threadControlUpdatedAt: ago(DAY),
      }),
      conversationId: "conv-1",
      event: "standbyReceived",
      ownerRole: "ai_agent",
      ownerAppId: "622851382610562",
      occurredAt,
    })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadOwnerExpiresAt: null }),
    )
  })

  test("stores an unknown Meta role as null", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("controlTaken", null, NOW),
    )

    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox(),
      conversationId: "conv-1",
      event: "controlTaken",
      ownerRole: "some_future_role",
      occurredAt: NOW,
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ ownerRole: null }),
    )
  })

  test("a state change writes one deterministic divider, invalidates the cache and publishes realtime", async () => {
    const occurredAt = ago(5000)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("controlPassed", "escalation", occurredAt),
    )

    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerRole: "ai_agent",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "controlPassed",
      ownerRole: "escalation",
      previousOwnerRole: "ai_agent",
      occurredAt,
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
    expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        workspaceId: "ws-1",
        sourceId: `thread-control:ci-1:controlPassed:${occurredAt.getTime()}`,
        senderType: "system",
        messageType: "activity",
        createdAt: occurredAt,
        contentAttributes: {
          type: "threadControl",
          event: "controlPassed",
          ownerRole: "escalation",
          previousOwnerRole: "ai_agent",
        },
      }),
    )
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "contactInboxThreadControlUpdated",
      data: {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        threadControlState: "owned",
        threadOwnerRole: "escalation",
        threadOwnerAppId: null,
        threadOwnerExpiresAt: null,
        threadControlUpdatedAt: occurredAt.toISOString(),
        threadControlLastEvent: "controlPassed",
      },
    })
  })

  test("an app-id channel persists both app ids and the realtime payload carries the owner app id", async () => {
    const occurredAt = ago(5000)
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...appliedRow("controlPassed", null, occurredAt),
      threadOwnerAppId: "app-us",
    })

    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "controlPassed",
      ownerRole: null,
      ownerAppId: "app-us",
      previousOwnerAppId: "app-bot",
      occurredAt,
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerAppId: "app-us",
        previousOwnerAppId: "app-bot",
      }),
    )
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "contactInboxThreadControlUpdated",
        data: expect.objectContaining({ threadOwnerAppId: "app-us" }),
      }),
    )
    // The divider keeps the handing-over app id per-event for audit.
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          previousOwnerAppId: "app-bot",
        }),
      }),
    )
  })

  test("a change of owner app alone (same state, no role) is a state change with a divider", async () => {
    const occurredAt = ago(5000)
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...appliedRow("controlTaken", null, occurredAt),
      threadOwnerAppId: "app-b",
    })

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerAppId: "app-a",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "controlTaken",
      ownerRole: null,
      ownerAppId: "app-b",
      occurredAt,
    })

    expect(result.stateChanged).toBe(true)
    expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
    // No explicit previous app id → the divider falls back to the stored owner.
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          previousOwnerAppId: "app-a",
        }),
      }),
    )
  })

  test("falls back to the stored owner role as the previous owner", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("released", null, NOW),
    )

    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerRole: "customer_service",
        threadControlUpdatedAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "released",
      occurredAt: NOW,
    })

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        contentAttributes: expect.objectContaining({
          previousOwnerRole: "customer_service",
        }),
      }),
    )
  })

  test("a redelivery does not mislabel the new owner as the previous owner", async () => {
    // The row already moved to the new owner on the first (now-redelivered)
    // attempt; with no explicit previous owner in the payload, the divider must
    // OMIT it rather than fall back to the post-transition owner.
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("controlPassed", "escalation", NOW),
    )

    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadOwnerRole: "escalation",
        threadOwnerAppId: "app-new-owner",
        threadControlLastEvent: "controlPassed",
        threadControlUpdatedAt: NOW,
      }),
      conversationId: "conv-1",
      event: "controlPassed",
      occurredAt: NOW,
    })

    const divider = mocks.createOrUpdate.mock.calls
      .map(([arg]) => arg as { contentAttributes?: Record<string, unknown> })
      .find((arg) => arg.contentAttributes?.type === "threadControl")
    expect(divider?.contentAttributes).not.toHaveProperty("previousOwnerAppId")
    expect(divider?.contentAttributes).not.toHaveProperty("previousOwnerRole")
  })

  test("a stale event writes nothing: no divider, no cache bust, no realtime", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(null)

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox(),
      conversationId: "conv-1",
      event: "controlTaken",
      ownerRole: "ai_agent",
      occurredAt: ago(DAY),
      context: { type: "summary", text: "ignored" },
    })

    expect(result).toMatchObject({ eventApplied: false, stateChanged: false })
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("an applied event that keeps the same state and role writes no divider but re-announces the snapshot", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", "ai_agent", NOW),
    )

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadOwnerRole: "ai_agent",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "standbyReceived",
      ownerRole: "ai_agent",
      occurredAt: NOW,
    })

    expect(result).toMatchObject({ eventApplied: true, stateChanged: false })
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
    // Only the idempotent routing snapshot, never a timeline message.
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledTimes(1)
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "contactInboxThreadControlUpdated",
      }),
    )
  })

  test("a row serialized through a job payload (ISO string dates) resolves like a DB row", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", "ai_agent", NOW),
    )
    const serialized = JSON.parse(
      JSON.stringify(
        makeContactInbox({
          threadControlState: "standby",
          threadOwnerRole: "ai_agent",
          threadControlUpdatedAt: ago(HOUR),
          lastIncomingMessageAt: ago(HOUR),
        }),
      ),
    ) as ContactInboxModel

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: serialized,
      conversationId: "conv-1",
      event: "standbyReceived",
      ownerRole: "ai_agent",
      occurredAt: NOW,
    })

    expect(result).toMatchObject({ eventApplied: true, stateChanged: false })
  })

  test("a row that predates the routing columns counts as never observed", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("serviceRejected", null, NOW),
    )
    const legacy = {
      id: "ci-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
      lastIncomingMessageAt: ago(HOUR).toISOString(),
    } as unknown as ContactInboxModel

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: legacy,
      conversationId: "conv-1",
      event: "serviceRejected",
      occurredAt: NOW,
    })

    expect(result).toMatchObject({ eventApplied: true, stateChanged: true })
  })

  test("an owned row idle after 24h of silence counts as a change into owned", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("inboundReceived", null, NOW),
    )

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(2 * DAY),
        lastIncomingMessageAt: ago(2 * DAY),
      }),
      conversationId: "conv-1",
      event: "inboundReceived",
      occurredAt: NOW,
    })

    expect(result.stateChanged).toBe(true)
  })

  test("a context writes one idempotent card even without a state change", async () => {
    const occurredAt = ago(2000)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("inboundReceived", null, occurredAt),
    )

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "inboundReceived",
      occurredAt,
      context: { type: "summary", text: "Wants a refund" },
      handoverNote: "escalated by bot",
    })

    expect(result).toMatchObject({ eventApplied: true, stateChanged: false })
    expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: `thread-control-context:ci-1:inboundReceived:${occurredAt.getTime()}`,
        messageType: "activity",
        contentAttributes: {
          type: "threadControlContext",
          context: { type: "summary", text: "Wants a refund" },
          handoverNote: "escalated by bot",
        },
      }),
    )
  })

  test("a handover note without a context still writes one note-only card", async () => {
    const occurredAt = ago(2000)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("inboundReceived", null, occurredAt),
    )

    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "inboundReceived",
      occurredAt,
      // Meta omits conversation_context when the new owner had standby access,
      // but may still send the note — it must not be dropped.
      handoverNote: "escalated by bot",
    })

    expect(result).toMatchObject({ eventApplied: true, stateChanged: false })
    expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: `thread-control-context:ci-1:inboundReceived:${occurredAt.getTime()}`,
        messageType: "activity",
        contentAttributes: {
          type: "threadControlContext",
          handoverNote: "escalated by bot",
        },
      }),
    )
  })

  test("a redelivered divider (not new) is not broadcast twice", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("released", null, NOW),
    )
    mocks.createOrUpdate.mockImplementation((input: { id: string }) =>
      Promise.resolve({ message: { ...input }, isNew: false }),
    )

    await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event: "released",
      occurredAt: NOW,
    })

    const messageBroadcasts = mocks.publishToWorkspaceParty.mock.calls.filter(
      ([, event]) => event.eventType === "messageCreated",
    )
    expect(messageBroadcasts).toHaveLength(0)
  })

  describe("inbox routing-traffic marker", () => {
    const record = (
      event: ThreadControlEvent,
      seenAt: Date | null,
      context?: boolean,
    ) => {
      mocks.applyThreadControlTransition.mockResolvedValue(
        appliedRow(event, null, NOW),
      )
      return threadControlService.recordEvent({
        workspaceId: "ws-1",
        inbox: inbox(seenAt),
        contactInbox: makeContactInbox(),
        conversationId: "conv-1",
        event,
        occurredAt: NOW,
        ...(context
          ? { context: { type: "summary", text: "s" } as const }
          : {}),
      })
    }

    test.each([
      "standbyReceived",
      "controlPassed",
      "controlTaken",
      "taken",
      "released",
      "passed",
      "serviceRejected",
    ] as const)("%s marks the inbox seen when never marked", async (event) => {
      await record(event, null)

      expect(mocks.touchThreadControlSeen).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        seenAt: NOW,
      })
    })

    test("serviceSent and a context-less inboundReceived never mark it", async () => {
      await record("serviceSent", null)
      await record("inboundReceived", null)

      expect(mocks.touchThreadControlSeen).not.toHaveBeenCalled()
    })

    test("an inboundReceived that carries a context does mark it", async () => {
      await record("inboundReceived", null, true)

      expect(mocks.touchThreadControlSeen).toHaveBeenCalledTimes(1)
    })

    test("a stale event still marks the inbox (routing traffic was seen)", async () => {
      mocks.applyThreadControlTransition.mockResolvedValue(null)

      await threadControlService.recordEvent({
        workspaceId: "ws-1",
        inbox: inbox(null),
        contactInbox: makeContactInbox(),
        conversationId: "conv-1",
        event: "standbyReceived",
        occurredAt: ago(DAY),
      })

      expect(mocks.touchThreadControlSeen).toHaveBeenCalledTimes(1)
    })

    test("is throttled: a marker fresher than the refresh interval skips the write", async () => {
      await record(
        "standbyReceived",
        ago(THREAD_CONTROL_SEEN_REFRESH_MS - 1000),
      )

      expect(mocks.touchThreadControlSeen).not.toHaveBeenCalled()
    })

    test("is refreshed once the marker is older than the refresh interval", async () => {
      await record(
        "standbyReceived",
        ago(THREAD_CONTROL_SEEN_REFRESH_MS + 1000),
      )

      expect(mocks.touchThreadControlSeen).toHaveBeenCalledTimes(1)
    })
  })
})

describe("threadControlService.recordInboundDelivery", () => {
  const deliver = (input: {
    delivery: "owner" | "standby"
    contactInbox?: ContactInboxModel
    seenAt?: Date | null
    context?: boolean
  }) =>
    threadControlService.recordInboundDelivery({
      workspaceId: "ws-1",
      inbox: inbox(input.seenAt ?? null),
      contactInbox: input.contactInbox ?? makeContactInbox(),
      conversationId: "conv-1",
      delivery: input.delivery,
      occurredAt: NOW,
      now: NOW,
      ...(input.context
        ? { context: { type: "summary", text: "s" } as const }
        : {}),
    })

  beforeEach(() => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("inboundReceived", null, NOW),
    )
  })

  test("single-partner: a null thread on an inbox with no routing traffic writes nothing at all", async () => {
    const result = await deliver({ delivery: "owner" })

    expect(result).toBeNull()
    // Query count: not one repository call, message write or broadcast.
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
    expect(mocks.touchThreadControlSeen).not.toHaveBeenCalled()
    expect(mocks.createMessageRepository).not.toHaveBeenCalled()
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("an active inbox marks a new owner delivery as owned", async () => {
    const result = await deliver({ delivery: "owner", seenAt: ago(DAY) })

    expect(result).toMatchObject({ eventApplied: true, stateChanged: true })
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "inboundReceived" }),
    )
  })

  test("a standby-copy supersede uses the dedicated write at the copy's own time; a plain delivery uses the normal write", async () => {
    const standbyAt = ago(DAY)
    const observed = makeContactInbox({
      threadControlState: "standby",
      threadControlUpdatedAt: standbyAt,
      threadControlLastEvent: "standbyReceived",
    })
    mocks.promoteStandbyToOwnerDelivery.mockResolvedValue(
      appliedRow("inboundReceived", null, standbyAt),
    )

    await threadControlService.recordInboundDelivery({
      workspaceId: "ws-1",
      inbox: inbox(ago(DAY)),
      contactInbox: observed,
      conversationId: "conv-1",
      delivery: "owner",
      occurredAt: standbyAt,
      supersedesStandbyAt: standbyAt,
      now: NOW,
    })
    expect(mocks.promoteStandbyToOwnerDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ci-1",
        workspaceId: "ws-1",
        occurredAt: standbyAt,
      }),
    )
    // The event time is never advanced and the normal guarded write is unused.
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()

    await deliver({ delivery: "owner", contactInbox: observed })
    expect(mocks.promoteStandbyToOwnerDelivery).toHaveBeenCalledTimes(1)
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledTimes(1)
  })

  test("a promotion the dedicated write rejects falls back to the normal guard (a handover already won: stale, not announced)", async () => {
    mocks.promoteStandbyToOwnerDelivery.mockResolvedValue(null)
    mocks.applyThreadControlTransition.mockResolvedValue(null)

    const result = await threadControlService.recordInboundDelivery({
      workspaceId: "ws-1",
      inbox: inbox(ago(DAY)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(DAY),
        threadControlLastEvent: "standbyReceived",
      }),
      conversationId: "conv-1",
      delivery: "owner",
      occurredAt: ago(DAY),
      supersedesStandbyAt: ago(DAY),
      now: NOW,
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "inboundReceived",
        occurredAt: ago(DAY),
      }),
    )
    expect(result).toMatchObject({ eventApplied: false, row: null })
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalled()
  })

  test("a thread already observed (non-null) is owned even on a quiet inbox", async () => {
    await deliver({
      delivery: "owner",
      contactInbox: makeContactInbox({
        threadControlState: "idle",
        threadControlUpdatedAt: ago(DAY),
        lastIncomingMessageAt: ago(2 * DAY),
      }),
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledTimes(1)
  })

  test("a context-carrying owner delivery activates the inbox for the next contact", async () => {
    // Contact A: null thread, quiet inbox, but the delivery carries a context.
    await deliver({ delivery: "owner", context: true })
    expect(mocks.touchThreadControlSeen).toHaveBeenCalledTimes(1)
    const { seenAt } = mocks.touchThreadControlSeen.mock.calls[0]?.[0] as {
      seenAt: Date
    }
    mocks.applyThreadControlTransition.mockClear()

    // Contact B: context-less, on the inbox as reloaded after that write.
    const result = await deliver({
      delivery: "owner",
      seenAt,
      contactInbox: makeContactInbox({ id: "ci-2", contactId: "contact-2" }),
    })

    expect(result).not.toBeNull()
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ci-2", event: "inboundReceived" }),
    )
  })

  test("the inbox decays after 30 days without routing traffic: new threads stay null", async () => {
    const stillActive = await deliver({
      delivery: "owner",
      seenAt: ago(THREAD_CONTROL_INBOX_ACTIVE_MS - HOUR),
    })
    expect(stillActive).not.toBeNull()
    mocks.applyThreadControlTransition.mockClear()

    const decayed = await deliver({
      delivery: "owner",
      seenAt: ago(THREAD_CONTROL_INBOX_ACTIVE_MS + HOUR),
    })

    expect(decayed).toBeNull()
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })

  test("an owner delivery on an already-owned thread writes nothing without a context", async () => {
    const result = await deliver({
      delivery: "owner",
      seenAt: ago(HOUR),
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
    })

    expect(result).toBeNull()
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })

  test("an owner delivery on an owned thread still records a context card", async () => {
    await deliver({
      delivery: "owner",
      seenAt: ago(HOUR),
      context: true,
      contactInbox: makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledTimes(1)
    expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
  })

  test("a standby delivery records standbyReceived even on a null thread and quiet inbox", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", null, NOW),
    )

    await deliver({ delivery: "standby" })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "standbyReceived" }),
    )
    expect(mocks.touchThreadControlSeen).toHaveBeenCalledTimes(1)
  })

  test("a standby delivery on an already-standby thread writes nothing", async () => {
    const result = await deliver({
      delivery: "standby",
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
    })

    expect(result).toBeNull()
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })
})

describe("threadControlService.requestAction — timing against events during the call", () => {
  const T0 = new Date(NOW.getTime() - 10_000)
  const CALL_MS = 3000

  /** The guarded write, over one stored transition, with the real tie rule. */
  const installGuardedWrite = (initial: {
    event: ThreadControlEvent
    at: Date
  }) => {
    const stored = { ...initial }
    mocks.applyThreadControlTransition.mockImplementation(
      (write: {
        event: ThreadControlEvent
        ownerRole: string | null
        occurredAt: Date
      }) => {
        const isNewer = write.occurredAt.getTime() > stored.at.getTime()
        const winsTie =
          write.occurredAt.getTime() === stored.at.getTime() &&
          eventsOutrankedBy(write.event).includes(stored.event)
        if (!(isNewer || winsTie)) {
          return Promise.resolve(null)
        }
        stored.event = write.event
        stored.at = write.occurredAt
        return Promise.resolve(
          appliedRow(write.event, write.ownerRole, write.occurredAt),
        )
      },
    )
    return stored
  }

  const ownedByTakeAtT0 = () =>
    makeContactInbox({
      threadControlState: "owned",
      threadOwnerRole: "escalation",
      threadControlUpdatedAt: T0,
      threadControlLastEvent: "taken",
      lastIncomingMessageAt: ago(HOUR),
    })

  const standbyByControlTaken = (at: Date) =>
    makeContactInbox({
      threadControlState: "standby",
      threadOwnerRole: "ai_agent",
      threadControlUpdatedAt: at,
      threadControlLastEvent: "controlTaken",
      lastIncomingMessageAt: ago(HOUR),
    })

  const repeatTake = (
    applyOnChannel: () => Promise<{ ownerRole: "escalation" }>,
  ) =>
    threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "take",
      applyOnChannel,
    })

  test.each([
    ["one second into the call", 1000],
    ["in the same second the call started", 0],
  ])("a control_taken landing %s wins: standby remains, no Take divider", async (_label, offsetMs) => {
    const controlTakenAt = new Date(NOW.getTime() + offsetMs)
    const stored = installGuardedWrite({ event: "taken", at: T0 })
    mocks.findModelByIdForWorkspace
      .mockResolvedValueOnce(ownedByTakeAtT0())
      .mockResolvedValueOnce(standbyByControlTaken(controlTakenAt))
    // Meta applies our take, another partner's control_taken commits while
    // our HTTP call is in flight, and the response arrives late.
    const applyOnChannel = vi.fn(() => {
      stored.event = "controlTaken"
      stored.at = controlTakenAt
      vi.setSystemTime(new Date(NOW.getTime() + CALL_MS))
      return Promise.resolve({ ownerRole: "escalation" as const })
    })

    const snapshot = await repeatTake(applyOnChannel)

    // Stamped at the request start (NOW), not at the response (NOW + 3s).
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "taken", occurredAt: NOW }),
    )
    expect(stored).toEqual({ event: "controlTaken", at: controlTakenAt })
    expect(snapshot.threadControlState).toBe("standby")
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
  })

  test("an event that landed before the request started loses: our take wins through the fallback", async () => {
    const controlTakenAt = new Date(NOW.getTime() - 2000)
    // Read taken@T0; a control_taken committed before our call started.
    const stored = installGuardedWrite({
      event: "controlTaken",
      at: controlTakenAt,
    })
    mocks.createOrUpdate.mockResolvedValue({ message: {}, isNew: true })
    mocks.findModelByIdForWorkspace.mockResolvedValueOnce(ownedByTakeAtT0())

    const snapshot = await repeatTake(
      vi.fn().mockResolvedValue({ ownerRole: "escalation" }),
    )

    expect(mocks.applyThreadControlTransition).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ occurredAt: T0 }),
    )
    expect(mocks.applyThreadControlTransition).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ occurredAt: NOW }),
    )
    expect(stored).toEqual({ event: "taken", at: NOW })
    expect(snapshot.threadControlState).toBe("owned")
    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: `thread-control:ci-1:taken:${NOW.getTime()}`,
      }),
    )
  })
})

describe("threadControlService.requestAction", () => {
  const request = (action: "take" | "release" | "pass") => {
    const applyOnChannel = vi.fn().mockResolvedValue({ ownerRole: null })
    return {
      applyOnChannel,
      promise: threadControlService.requestAction({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        action,
        applyOnChannel,
      }),
    }
  }

  test.each([
    ["take", "taken"],
    ["release", "released"],
    ["pass", "passed"],
  ] as const)("%s calls the channel then records %s and returns the snapshot", async (action, event) => {
    const row = makeContactInbox({
      threadControlState: THREAD_CONTROL_TRANSITIONS[event],
      threadControlUpdatedAt: NOW,
    })
    mocks.findModelByIdForWorkspace
      .mockResolvedValueOnce(makeContactInbox())
      .mockResolvedValueOnce(row)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow(event, null, NOW),
    )

    const { applyOnChannel, promise } = request(action)
    const snapshot = await promise

    expect(applyOnChannel).toHaveBeenCalledWith(makeContactInbox())
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event, occurredAt: NOW }),
    )
    // The applied row is returned as is: no re-read after the write.
    expect(mocks.findModelByIdForWorkspace).toHaveBeenCalledTimes(1)
    expect(snapshot).toEqual({
      contactInboxId: "ci-1",
      threadControlState: THREAD_CONTROL_TRANSITIONS[event],
      threadOwnerRole: null,
      threadOwnerAppId: null,
      threadOwnerExpiresAt: null,
      threadControlUpdatedAt: NOW,
      threadControlLastEvent: event,
    })
  })

  test("persists the owner app id the channel returned and remembers the previous owner app", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(
      makeContactInbox({ threadOwnerAppId: "app-bot" }),
    )
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...appliedRow("taken", null, NOW),
      threadOwnerAppId: "app-us",
    })

    const snapshot = await threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "take",
      applyOnChannel: vi
        .fn()
        .mockResolvedValue({ ownerRole: null, ownerAppId: "app-us" }),
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "taken",
        ownerRole: null,
        ownerAppId: "app-us",
        previousOwnerAppId: "app-bot",
      }),
    )
    expect(snapshot.threadOwnerAppId).toBe("app-us")
  })

  test("records the owner role the channel returned (our own pass → escalation)", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(makeContactInbox())
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("passed", "escalation", NOW),
    )

    const snapshot = await threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "pass",
      applyOnChannel: vi.fn().mockResolvedValue({ ownerRole: "escalation" }),
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "passed", ownerRole: "escalation" }),
    )
    expect(snapshot.threadOwnerRole).toBe("escalation")
  })

  test("an expected version that no longer matches skips the channel call and returns the current snapshot", async () => {
    const reacquiredAt = new Date(NOW.getTime() + 5000)
    mocks.findModelByIdForWorkspace.mockResolvedValue(
      makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: reacquiredAt,
      }),
    )
    const applyOnChannel = vi.fn()

    const snapshot = await threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "release",
      applyOnChannel,
      expectedThreadControlUpdatedAt: NOW,
    })

    expect(applyOnChannel).not.toHaveBeenCalled()
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
    expect(snapshot.threadControlUpdatedAt).toEqual(reacquiredAt)
  })

  test("a matching expected version releases as usual", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(
      makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: NOW,
      }),
    )
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("released", null, NOW),
    )
    const applyOnChannel = vi.fn().mockResolvedValue({ ownerRole: null })

    await threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "release",
      applyOnChannel,
      expectedThreadControlUpdatedAt: NOW,
    })

    expect(applyOnChannel).toHaveBeenCalledTimes(1)
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "released" }),
    )
  })

  test("a channel failure propagates unchanged and leaves the state untouched", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(makeContactInbox())
    const failure = new Error("2494191: not escalation")
    const applyOnChannel = vi.fn().mockRejectedValue(failure)

    await expect(
      threadControlService.requestAction({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        action: "take",
        applyOnChannel,
      }),
    ).rejects.toBe(failure)
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })

  test("a contact inbox outside the workspace is not found and never reaches the channel", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(null)

    const { applyOnChannel, promise } = request("release")

    await expect(promise).rejects.toMatchObject({ code: "notFound" })
    expect(applyOnChannel).not.toHaveBeenCalled()
  })

  test("a stale recording returns the current row instead of the attempted state", async () => {
    const current = makeContactInbox({
      threadControlState: "standby",
      threadOwnerRole: "ai_agent",
      threadControlUpdatedAt: NOW,
    })
    mocks.findModelByIdForWorkspace
      .mockResolvedValueOnce(makeContactInbox())
      .mockResolvedValueOnce(current)
    mocks.applyThreadControlTransition.mockResolvedValue(null)

    const { promise } = request("take")

    await expect(promise).resolves.toMatchObject({
      threadControlState: "standby",
      threadOwnerRole: "ai_agent",
    })
    expect(mocks.findModelByIdForWorkspace).toHaveBeenCalledTimes(2)
  })

  test("our own call is stamped at whole-second resolution, like Meta's events", async () => {
    vi.setSystemTime(new Date(NOW.getTime() + 400))
    mocks.findModelByIdForWorkspace.mockResolvedValue(makeContactInbox())
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("taken", null, NOW),
    )

    await request("take").promise

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "taken", occurredAt: NOW }),
    )
  })

  test("our take at T+400ms vs Meta's control_taken at T ends standby in both orders", async () => {
    const takeAt = new Date(NOW.getTime() + 400)
    const finals: FakeRow[] = []
    for (const takeFirst of [true, false]) {
      const row: FakeRow = { state: null, role: null, at: null, event: null }
      installOrderIndependentRepository(row)
      mocks.findModelByIdForWorkspace.mockResolvedValue(makeContactInbox())
      const take = async () => {
        vi.setSystemTime(takeAt)
        await request("take").promise
      }
      const controlTaken = () =>
        threadControlService.recordEvent({
          workspaceId: "ws-1",
          inbox: inbox(ago(HOUR)),
          contactInbox: makeContactInbox(),
          conversationId: "conv-1",
          event: "controlTaken",
          ownerRole: "ai_agent",
          occurredAt: NOW,
        })
      if (takeFirst) {
        await take()
        await controlTaken()
      } else {
        await controlTaken()
        await take()
      }
      finals.push({ ...row })
    }

    expect(finals[0]).toEqual(finals[1])
    expect(finals[0]).toMatchObject({ state: "standby", role: "ai_agent" })
  })
})

describe("threadControlService.recordEvent — redelivery", () => {
  const alreadyApplied = () =>
    makeContactInbox({
      threadControlState: "owned",
      threadOwnerRole: "escalation",
      threadControlUpdatedAt: NOW,
      threadControlLastEvent: "controlPassed",
      lastIncomingMessageAt: ago(HOUR),
    })

  const redeliver = () =>
    threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: alreadyApplied(),
      conversationId: "conv-1",
      event: "controlPassed",
      ownerRole: "escalation",
      occurredAt: NOW,
    })

  beforeEach(() => {
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...alreadyApplied(),
      threadControlUpdatedAt: NOW,
    })
  })

  test("an exact redelivery is applied but flagged, so one-shot work can skip it", async () => {
    mocks.createOrUpdate.mockResolvedValue({ message: {}, isNew: false })

    const result = await redeliver()

    expect(result).toMatchObject({
      eventApplied: true,
      stateChanged: false,
      isRedelivery: true,
    })
  })

  test("the same event at a different time is not a redelivery", async () => {
    const result = await threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: alreadyApplied(),
      conversationId: "conv-1",
      event: "controlPassed",
      ownerRole: "escalation",
      occurredAt: new Date(NOW.getTime() + 1000),
    })

    expect(result.isRedelivery).toBe(false)
  })

  test("a retry after a crash past the guarded write restores the divider and realtime", async () => {
    // First attempt applied the row, then died before the divider was written.
    mocks.createOrUpdate.mockResolvedValue({ message: {}, isNew: true })

    await redeliver()

    expect(mocks.createOrUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: `thread-control:ci-1:controlPassed:${NOW.getTime()}`,
      }),
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalled()
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "contactInboxThreadControlUpdated",
      }),
    )
  })

  test("a retry after a failure between the divider and the realtime publish still invalidates and publishes", async () => {
    // Attempt 1 wrote the divider, then died before the cache bust/publish.
    mocks.createOrUpdate.mockResolvedValue({ message: {}, isNew: false })

    await redeliver()

    // The divider is not written twice ...
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({ eventType: "messageCreated" }),
    )
    // ... but the cache bust and the routing snapshot are redone.
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "contactInboxThreadControlUpdated",
      }),
    )
  })

  describe("a repeated own action (retry with a new time) is mapped onto the original transition", () => {
    const T1 = new Date(NOW.getTime() - 5000)
    const T2 = new Date(NOW.getTime() - 3000)
    const T3 = NOW
    const takeDivider = `thread-control:ci-1:taken:${T1.getTime()}`

    /** The row after attempt 1's guarded write committed `taken` at T1. */
    const ownedByTakeAtT1 = () =>
      makeContactInbox({
        threadControlState: "owned",
        threadOwnerRole: "escalation",
        threadControlUpdatedAt: T1,
        threadControlLastEvent: "taken",
        lastIncomingMessageAt: ago(HOUR),
      })

    const take = (contactInbox: ContactInboxModel, occurredAt: Date) =>
      threadControlService.recordEvent({
        workspaceId: "ws-1",
        inbox: inbox(ago(HOUR)),
        contactInbox,
        conversationId: "conv-1",
        event: "taken",
        ownerRole: "escalation",
        occurredAt,
      })

    test("attempt 1 commits, dies before the divider; retries restore exactly one divider at the ORIGINAL time", async () => {
      // Attempt 1: the transition commits, the divider write throws.
      mocks.applyThreadControlTransition.mockResolvedValueOnce(
        appliedRow("taken", "escalation", T1),
      )
      mocks.createOrUpdate.mockRejectedValueOnce(new Error("db down"))
      await expect(take(makeContactInbox(), T1)).rejects.toThrow("db down")
      mocks.createOrUpdate.mockReset()

      // Retry 1 at T2: remapped onto T1 (an exact redelivery), so the guarded
      // write does not advance the clock and the missing divider is created.
      mocks.applyThreadControlTransition.mockResolvedValue(ownedByTakeAtT1())
      mocks.createOrUpdate.mockResolvedValueOnce({ message: {}, isNew: true })
      const retry = await take(ownedByTakeAtT1(), T2)

      expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
        expect.objectContaining({ event: "taken", occurredAt: T1 }),
      )
      expect(retry).toMatchObject({ eventApplied: true, isRedelivery: true })
      expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
      expect(mocks.createOrUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: takeDivider, createdAt: T1 }),
      )
      expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          eventType: "contactInboxThreadControlUpdated",
        }),
      )

      // Retry 2 at T3: the row still says T1, the same sourceId is upserted
      // and already exists, so no second divider is created.
      mocks.publishToWorkspaceParty.mockClear()
      mocks.createOrUpdate.mockResolvedValueOnce({ message: {}, isNew: false })
      await take(ownedByTakeAtT1(), T3)

      expect(mocks.createOrUpdate).toHaveBeenCalledTimes(2)
      expect(mocks.createOrUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ sourceId: takeDivider }),
      )
      expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({ eventType: "messageCreated" }),
      )
    })

    test("a same-state event with a different last event is not remapped and writes no divider", async () => {
      const ownedByHandover = makeContactInbox({
        threadControlState: "owned",
        threadOwnerRole: "escalation",
        threadControlUpdatedAt: T1,
        threadControlLastEvent: "controlPassed",
        lastIncomingMessageAt: ago(HOUR),
      })
      mocks.applyThreadControlTransition.mockResolvedValue({
        ...ownedByHandover,
        threadControlUpdatedAt: T2,
        threadControlLastEvent: "taken",
      })

      const result = await take(ownedByHandover, T2)

      expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
        expect.objectContaining({ occurredAt: T2 }),
      )
      expect(result).toMatchObject({
        eventApplied: true,
        stateChanged: false,
        isRedelivery: false,
      })
      expect(mocks.createOrUpdate).not.toHaveBeenCalled()
      // Still announced: the snapshot is idempotent.
      expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          eventType: "contactInboxThreadControlUpdated",
        }),
      )
    })

    test("a Meta event is never remapped, even when it repeats the last event", async () => {
      const ownedByHandover = makeContactInbox({
        threadControlState: "owned",
        threadOwnerRole: "escalation",
        threadControlUpdatedAt: T1,
        threadControlLastEvent: "controlPassed",
        lastIncomingMessageAt: ago(HOUR),
      })
      mocks.applyThreadControlTransition.mockResolvedValue({
        ...ownedByHandover,
        threadControlUpdatedAt: T2,
      })

      await threadControlService.recordEvent({
        workspaceId: "ws-1",
        inbox: inbox(ago(HOUR)),
        contactInbox: ownedByHandover,
        conversationId: "conv-1",
        event: "controlPassed",
        ownerRole: "escalation",
        occurredAt: T2,
        context: { type: "summary", text: "Wants a refund" },
      })

      expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
        expect.objectContaining({ occurredAt: T2 }),
      )
      // The context card is keyed on the event's own time.
      expect(mocks.createOrUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: `thread-control-context:ci-1:controlPassed:${T2.getTime()}`,
        }),
      )
    })

    test("a remapped repeat that is stale (a newer event landed during our call) is applied at the requested time", async () => {
      // Read before the Meta call: taken@T1. During the call Meta's
      // control_taken landed at T2, so the remapped write at T1 is stale.
      const newer = {
        ...ownedByTakeAtT1(),
        threadControlState: "owned" as const,
        threadControlUpdatedAt: T3,
        threadControlLastEvent: "taken" as const,
      }
      mocks.applyThreadControlTransition
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(newer)
      mocks.createOrUpdate.mockResolvedValue({ message: {}, isNew: true })

      const result = await take(ownedByTakeAtT1(), T3)

      expect(mocks.applyThreadControlTransition).toHaveBeenCalledTimes(2)
      expect(mocks.applyThreadControlTransition).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ occurredAt: T1 }),
      )
      expect(mocks.applyThreadControlTransition).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ event: "taken", occurredAt: T3 }),
      )
      expect(result).toMatchObject({
        eventApplied: true,
        stateChanged: true,
        isRedelivery: false,
        row: newer,
      })
      // Its own divider, keyed on the time actually applied, and announced.
      expect(mocks.createOrUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceId: `thread-control:ci-1:taken:${T3.getTime()}`,
        }),
      )
      expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
        "ws-1",
        expect.objectContaining({
          eventType: "contactInboxThreadControlUpdated",
        }),
      )
    })

    test("a stale event that was not remapped is not retried", async () => {
      mocks.applyThreadControlTransition.mockResolvedValue(null)

      await take(makeContactInbox(), T2)

      expect(mocks.applyThreadControlTransition).toHaveBeenCalledTimes(1)
    })

    test("a row that came through a job payload (ISO string dates) is remapped the same way", async () => {
      const serialized = JSON.parse(JSON.stringify(ownedByTakeAtT1()))
      mocks.applyThreadControlTransition.mockResolvedValue(ownedByTakeAtT1())
      mocks.createOrUpdate.mockResolvedValue({ message: {}, isNew: false })

      await take(serialized, T2)

      expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
        expect.objectContaining({ occurredAt: T1 }),
      )
    })
  })

  test("a divider write failure after the state was applied still invalidates and publishes, then rethrows", async () => {
    const occurredAt = ago(5000)
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("controlTaken", "ai_agent", occurredAt),
    )
    mocks.createOrUpdate.mockRejectedValue(new Error("divider down"))

    await expect(
      threadControlService.recordEvent({
        workspaceId: "ws-1",
        inbox: inbox(ago(HOUR)),
        contactInbox: makeContactInbox({
          threadControlState: "owned",
          threadControlUpdatedAt: ago(HOUR),
          lastIncomingMessageAt: ago(HOUR),
        }),
        conversationId: "conv-1",
        event: "controlTaken",
        ownerRole: "ai_agent",
        occurredAt,
      }),
    ).rejects.toThrow("divider down")

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "contacts:contact-1:contact-inboxes",
    ])
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        eventType: "contactInboxThreadControlUpdated",
        data: expect.objectContaining({ threadControlState: "standby" }),
      }),
    )
  })

  test("a stale event does nothing at all", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(null)

    const result = await redeliver()

    expect(result.eventApplied).toBe(false)
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
    expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalled()
  })
})

describe("threadControlService.refreshForRouting", () => {
  test("a thread that never observed routing is returned as is, without a query", async () => {
    const contactInbox = makeContactInbox()

    const current = await threadControlService.refreshForRouting({
      workspaceId: "ws-1",
      contactInbox,
    })

    expect(current).toBe(contactInbox)
    expect(mocks.findModelByIdForWorkspace).not.toHaveBeenCalled()
  })

  test("a routed thread is re-read, workspace-scoped and uncached", async () => {
    const queued = makeContactInbox({ threadControlState: "owned" })
    const now = makeContactInbox({ threadControlState: "standby" })
    mocks.findModelByIdForWorkspace.mockResolvedValue(now)

    const current = await threadControlService.refreshForRouting({
      workspaceId: "ws-1",
      contactInbox: queued,
    })

    expect(mocks.findModelByIdForWorkspace).toHaveBeenCalledWith({
      id: "ci-1",
      workspaceId: "ws-1",
    })
    expect(current).toBe(now)
  })

  test("falls back to the given row when the row is gone", async () => {
    const queued = makeContactInbox({ threadControlState: "owned" })
    mocks.findModelByIdForWorkspace.mockResolvedValue(null)

    await expect(
      threadControlService.refreshForRouting({
        workspaceId: "ws-1",
        contactInbox: queued,
      }),
    ).resolves.toBe(queued)
  })
})

describe("threadControlService.resolveCurrentState", () => {
  const input = { workspaceId: "ws-1", contactInboxId: "ci-1" }

  test("re-reads the row workspace-scoped and resolves an owned thread", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(
      makeContactInbox({
        threadControlState: "owned",
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(HOUR),
      }),
    )

    await expect(
      threadControlService.resolveCurrentState(input),
    ).resolves.toEqual({ state: "owned", threadControlUpdatedAt: ago(HOUR) })
    expect(mocks.findModelByIdForWorkspace).toHaveBeenCalledWith({
      id: "ci-1",
      workspaceId: "ws-1",
    })
  })

  test("resolves the fresh state, not the one the job was enqueued for", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(
      makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(HOUR),
      }),
    )

    await expect(
      threadControlService.resolveCurrentState(input),
    ).resolves.toMatchObject({ state: "standby" })
  })

  test("is null when the row is gone", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(null)

    await expect(
      threadControlService.resolveCurrentState(input),
    ).resolves.toBeNull()
  })
})

describe("threadControlService.promoteStandbyDelivery", () => {
  const message = (contentAttributes: Record<string, unknown> | null) => ({
    id: "msg-1",
    createdAt: NOW,
    contentAttributes,
  })

  test("a message not stored from a standby copy is never promoted and costs no query", async () => {
    const promoted = await threadControlService.promoteStandbyDelivery({
      workspaceId: "ws-1",
      message: message({ foo: 1 }),
    })

    expect(promoted).toBe(false)
    expect(mocks.claimContentAttributes).not.toHaveBeenCalled()
  })

  test("a standby copy is promoted by one guarded claim of the promoted key", async () => {
    mocks.claimContentAttributes.mockResolvedValue({ id: "msg-1" })

    const promoted = await threadControlService.promoteStandbyDelivery({
      workspaceId: "ws-1",
      message: message({ threadControlDelivery: "standby" }),
    })

    expect(promoted).toBe(true)
    expect(mocks.claimContentAttributes).toHaveBeenCalledWith({
      messageId: "msg-1",
      workspaceId: "ws-1",
      createdAt: NOW,
      guardKey: "threadControlPromoted",
      overlay: { threadControlPromoted: true },
    })
  })

  test("a row already promoted is never promoted again and costs no query", async () => {
    const promoted = await threadControlService.promoteStandbyDelivery({
      workspaceId: "ws-1",
      message: message({
        threadControlDelivery: "standby",
        threadControlPromoted: true,
      }),
    })

    expect(promoted).toBe(false)
    expect(mocks.claimContentAttributes).not.toHaveBeenCalled()
  })

  test("a promotion claimed in the meantime (stale in-memory row) is refused by the guard", async () => {
    mocks.claimContentAttributes.mockResolvedValue(null)

    const promoted = await threadControlService.promoteStandbyDelivery({
      workspaceId: "ws-1",
      message: message({ threadControlDelivery: "standby" }),
    })

    expect(promoted).toBe(false)
  })

  test("concurrent owner redeliveries promote exactly once", async () => {
    // The guarded UPDATE hands the row to exactly one caller.
    mocks.claimContentAttributes
      .mockResolvedValueOnce({ id: "msg-1" })
      .mockResolvedValueOnce(null)
    const standbyCopy = message({ threadControlDelivery: "standby" })

    const results = await Promise.all([
      threadControlService.promoteStandbyDelivery({
        workspaceId: "ws-1",
        message: standbyCopy,
      }),
      threadControlService.promoteStandbyDelivery({
        workspaceId: "ws-1",
        message: standbyCopy,
      }),
    ])

    expect(results.filter(Boolean)).toHaveLength(1)
  })
})

describe("threadControlService.releaseOwnedThreadsForContacts", () => {
  const conversations = [
    { id: "conv-1", contactId: "contact-1" },
    { id: "conv-2", contactId: "contact-2" },
  ]
  const archivedAt = new Date("2026-09-29T11:00:00.000Z")
  const row = (overrides: Record<string, unknown>) => ({
    id: "ci-1",
    contactId: "contact-1",
    inboxId: "inbox-1",
    channel: "whatsapp",
    threadControlState: "owned",
    threadControlUpdatedAt: ago(HOUR),
    lastIncomingMessageAt: ago(HOUR),
    ...overrides,
  })

  test("a channel without archive release (messenger) is skipped, whatsapp still enqueues", async () => {
    mocks.listThreadControlledByContactIds.mockResolvedValue([
      row({ id: "ci-messenger", channel: "messenger" }),
      row({ id: "ci-whatsapp", contactId: "contact-2", channel: "whatsapp" }),
    ])

    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt,
    })

    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueIntegrationJob.mock.calls[0]?.[0].data).toMatchObject({
      contactInboxId: "ci-whatsapp",
    })
  })

  test("enqueues one deduplicated release job per still-owned thread", async () => {
    const updatedAt = ago(HOUR)
    mocks.listThreadControlledByContactIds.mockResolvedValue([
      row({ threadControlUpdatedAt: updatedAt }),
    ])

    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt,
    })

    expect(mocks.listThreadControlledByContactIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1", "contact-2"],
    })
    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledTimes(1)
    const [job, options] = mocks.enqueueIntegrationJob.mock.calls[0] ?? []
    expect(job).toEqual({
      type: "threadControlAction",
      data: {
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        action: "release",
        // The enqueue-time ownership version the job validates before releasing.
        threadControlUpdatedAt: updatedAt.toISOString(),
      },
    })
    expect(options.jobId).toBe(
      `thread-release-ci-1-${updatedAt.getTime()}-${archivedAt.getTime()}`,
    )
    expect(options.jobId).not.toContain(":")
  })

  test("a re-archive at a new time enqueues a DISTINCT job id (not deduped against the prior archive)", async () => {
    const updatedAt = ago(HOUR)
    mocks.listThreadControlledByContactIds.mockResolvedValue([
      row({ threadControlUpdatedAt: updatedAt }),
    ])
    const laterArchivedAt = new Date(archivedAt.getTime() + 60_000)

    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt,
    })
    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt: laterArchivedAt,
    })

    const jobIds = mocks.enqueueIntegrationJob.mock.calls.map(
      ([, options]) => options.jobId,
    )
    // Same ownership version, different archive events → two distinct jobs, so
    // a retained completed no-op release cannot swallow the re-archive.
    expect(jobIds).toEqual([
      `thread-release-ci-1-${updatedAt.getTime()}-${archivedAt.getTime()}`,
      `thread-release-ci-1-${updatedAt.getTime()}-${laterArchivedAt.getTime()}`,
    ])
  })

  test("archive of an expired-owned thread (24h of silence) enqueues nothing", async () => {
    mocks.listThreadControlledByContactIds.mockResolvedValue([
      row({
        threadControlUpdatedAt: ago(3 * DAY),
        lastIncomingMessageAt: ago(3 * DAY),
      }),
    ])

    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt,
    })

    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
  })

  test("a thread whose owner row is fresh only through its last transition is still released", async () => {
    mocks.listThreadControlledByContactIds.mockResolvedValue([
      row({
        threadControlUpdatedAt: ago(HOUR),
        lastIncomingMessageAt: ago(3 * DAY),
      }),
    ])

    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt,
    })

    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledTimes(1)
  })

  test("no owned rows, or no conversations, enqueue nothing and skip the query when empty", async () => {
    mocks.listThreadControlledByContactIds.mockResolvedValue([])
    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
      archivedAt,
    })
    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations: [],
      archivedAt,
    })

    expect(mocks.enqueueIntegrationJob).not.toHaveBeenCalled()
    expect(mocks.listThreadControlledByContactIds).toHaveBeenCalledTimes(1)
  })
})

/**
 * In-memory twin of `applyThreadControlTransition`'s SQL guard: newer time
 * wins; on an equal second the higher precedence wins, an exact redelivery is
 * idempotent, anything else is stale. The real SQL is pinned by the database
 * package's DB-backed tests; this drives `recordEvent` through both processing
 * orders to prove the service adds no order dependence of its own.
 */
type FakeRow = {
  state: string | null
  role: string | null
  at: Date | null
  event: ThreadControlEvent | null
}

const installOrderIndependentRepository = (row: FakeRow) => {
  mocks.applyThreadControlTransition.mockImplementation(
    (input: {
      event: ThreadControlEvent
      ownerRole: string | null
      occurredAt: Date
    }) => {
      const state = THREAD_CONTROL_TRANSITIONS[input.event]
      const isNewer = row.at === null || row.at < input.occurredAt
      const isTie = row.at?.getTime() === input.occurredAt.getTime()
      const outranks =
        row.event !== null && eventsOutrankedBy(input.event).includes(row.event)
      const isRedelivery =
        row.event === input.event &&
        row.state === state &&
        row.role === input.ownerRole
      if (!(isNewer || (isTie && (outranks || isRedelivery)))) {
        return Promise.resolve(null)
      }
      row.state = state
      row.role = input.ownerRole
      row.at = input.occurredAt
      row.event = input.event
      return Promise.resolve({
        id: "ci-1",
        threadControlState: state,
        threadOwnerRole: input.ownerRole,
        threadControlUpdatedAt: input.occurredAt,
      })
    },
  )
}

describe("same-second event ordering", () => {
  type Scenario = {
    name: string
    first: { event: ThreadControlEvent; ownerRole: string | null }
    second: { event: ThreadControlEvent; ownerRole: string | null }
    expected: { state: string; role: string | null }
  }
  const scenarios: Scenario[] = [
    {
      name: "inferred inboundReceived vs explicit controlPassed",
      first: { event: "inboundReceived", ownerRole: null },
      second: { event: "controlPassed", ownerRole: "escalation" },
      expected: { state: "owned", role: "escalation" },
    },
    {
      name: "controlPassed vs controlTaken",
      first: { event: "controlPassed", ownerRole: "escalation" },
      second: { event: "controlTaken", ownerRole: "ai_agent" },
      expected: { state: "standby", role: "ai_agent" },
    },
    {
      name: "same standby state, different role (inferred vs explicit)",
      first: { event: "standbyReceived", ownerRole: null },
      second: { event: "controlTaken", ownerRole: "ai_agent" },
      expected: { state: "standby", role: "ai_agent" },
    },
    {
      name: "our own release vs a later-arriving inferred inbound",
      first: { event: "released", ownerRole: null },
      second: { event: "inboundReceived", ownerRole: null },
      expected: { state: "idle", role: null },
    },
  ]

  test.each(
    scenarios,
  )("$name ends in the same state in both processing orders", async ({
    first,
    second,
    expected,
  }) => {
    const finals: FakeRow[] = []
    for (const order of [
      [first, second],
      [second, first],
    ]) {
      const row: FakeRow = { state: null, role: null, at: null, event: null }
      installOrderIndependentRepository(row)
      for (const step of order) {
        await threadControlService.recordEvent({
          workspaceId: "ws-1",
          inbox: inbox(ago(HOUR)),
          contactInbox: makeContactInbox(),
          conversationId: "conv-1",
          event: step.event,
          ownerRole: step.ownerRole,
          occurredAt: NOW,
        })
      }
      finals.push({ ...row })
    }

    expect(finals[0]).toEqual(finals[1])
    expect(finals[0]).toMatchObject(expected)
  })
})

describe("threadControlService.recordInboundDelivery - owner app id", () => {
  const deliver = (input: {
    delivery: "owner" | "standby"
    ownerAppId?: string | null
    ownerRole?: "ai_agent" | null
    contactInbox?: ContactInboxModel
  }) =>
    threadControlService.recordInboundDelivery({
      workspaceId: "ws-1",
      inbox: inbox(ago(DAY)),
      contactInbox: input.contactInbox ?? makeContactInbox(),
      conversationId: "conv-1",
      delivery: input.delivery,
      ownerAppId: input.ownerAppId,
      ownerRole: input.ownerRole,
      occurredAt: NOW,
      now: NOW,
    })

  beforeEach(() => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", null, NOW),
    )
  })

  test("a standby delivery persists the owner app id it names", async () => {
    await deliver({ delivery: "standby", ownerAppId: "app-bot" })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "standbyReceived",
        ownerAppId: "app-bot",
      }),
    )
  })

  test("an owner delivery never records an owner app id", async () => {
    await deliver({ delivery: "owner", ownerAppId: "app-bot" })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "inboundReceived", ownerAppId: null }),
    )
  })

  test("a standby delivery carries the reported owner role; an owner delivery never does", async () => {
    await deliver({
      delivery: "standby",
      ownerAppId: "app-bot",
      ownerRole: "ai_agent",
    })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerAppId: "app-bot", ownerRole: "ai_agent" }),
    )

    await deliver({ delivery: "owner", ownerRole: "ai_agent" })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: "inboundReceived", ownerRole: null }),
    )
  })

  test("without an owner app id (WhatsApp) behaviour is unchanged", async () => {
    await deliver({ delivery: "standby" })
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "standbyReceived",
        ownerAppId: null,
        ownerRole: null,
      }),
    )
    mocks.applyThreadControlTransition.mockClear()

    // Already standby and no owner named: still nothing to write.
    const again = await deliver({
      delivery: "standby",
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(HOUR),
      }),
    })
    expect(again).toBeNull()
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })

  test("an already-standby thread learns a newly named owner", async () => {
    const result = await deliver({
      delivery: "standby",
      ownerAppId: "app-bot",
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(HOUR),
      }),
    })

    expect(result).not.toBeNull()
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ ownerAppId: "app-bot" }),
    )
  })
})

describe("threadControlService.syncThreadOwner", () => {
  const OWN = "app-own"
  const BOT = "app-bot"
  const PARTNER = "app-partner"

  const sync = (
    contactInbox: ContactInboxModel,
    owner: {
      ownerAppId: string | null
      ownAppId?: string | null
      businessAiAppId?: string | null
    } | null,
  ) =>
    threadControlService.syncThreadOwner({
      workspaceId: "ws-1",
      contactInbox,
      conversationId: "conv-1",
      fetchOwner: () =>
        Promise.resolve(owner ? { expiresAt: null, ...owner } : null),
      ownAppId: OWN,
      businessAiAppId: BOT,
    })

  const owned = (extra: Partial<ContactInboxModel> = {}) =>
    makeContactInbox({
      threadControlState: "owned",
      threadControlUpdatedAt: ago(HOUR),
      lastIncomingMessageAt: ago(HOUR),
      ...extra,
    })

  test("confirming the stored owner writes nothing (no divider)", async () => {
    const snapshot = await sync(owned(), { ownerAppId: OWN })

    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalled()
    expect(snapshot.threadControlState).toBe("owned")
  })

  test("confirming a standby partner owner writes nothing", async () => {
    await sync(
      makeContactInbox({
        threadControlState: "standby",
        threadOwnerAppId: PARTNER,
        threadControlUpdatedAt: ago(HOUR),
      } as Partial<ContactInboxModel>),
      { ownerAppId: PARTNER },
    )

    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })

  test("a partner owning a thread stored as owned records standbyReceived with the app id and flips the state", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...appliedRow("standbyReceived", null, NOW),
      threadOwnerAppId: PARTNER,
    })

    const snapshot = await sync(owned(), { ownerAppId: PARTNER })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "standbyReceived",
        ownerAppId: PARTNER,
        occurredAt: NOW,
      }),
    )
    expect(mocks.createOrUpdate).toHaveBeenCalledTimes(1)
    expect(snapshot).toMatchObject({
      threadControlState: "standby",
      threadOwnerAppId: PARTNER,
    })
  })

  test("a Business-AI owner is recorded with the ai_agent role, a partner with none", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...appliedRow("standbyReceived", null, NOW),
      threadOwnerAppId: BOT,
    })
    await sync(owned(), { ownerAppId: BOT })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: "standbyReceived",
        ownerAppId: BOT,
        ownerRole: "ai_agent",
      }),
    )

    await sync(owned(), { ownerAppId: PARTNER })
    expect(mocks.applyThreadControlTransition).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerAppId: PARTNER, ownerRole: null }),
    )
  })

  test("us owning a thread stored as standby records inboundReceived without an app id", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("inboundReceived", null, NOW),
    )

    await sync(
      makeContactInbox({
        threadControlState: "standby",
        threadOwnerAppId: BOT,
        threadControlUpdatedAt: ago(HOUR),
      } as Partial<ContactInboxModel>),
      { ownerAppId: OWN },
    )

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "inboundReceived", ownerAppId: null }),
    )
  })

  test("no owner on a thread stored as owned records released", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("released", null, NOW),
    )

    await sync(owned(), { ownerAppId: null })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "released" }),
    )
  })

  test("an unsupported channel (fetchOwner -> null) is a no-op", async () => {
    const snapshot = await sync(owned(), null)

    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
    expect(snapshot.threadControlState).toBe("owned")
  })

  test("identities reported by the channel are used when not passed", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", null, NOW),
    )

    await threadControlService.syncThreadOwner({
      workspaceId: "ws-1",
      contactInbox: owned(),
      conversationId: "conv-1",
      fetchOwner: () =>
        Promise.resolve({
          ownerAppId: PARTNER,
          expiresAt: null,
          ownAppId: OWN,
          businessAiAppId: BOT,
        }),
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "standbyReceived" }),
    )
  })

  test("a stale answer never overwrites an event that landed while the owner query was in flight", async () => {
    // The fetch starts at NOW; the newer event (e.g. a partner takeover)
    // lands 1.5s later, while the GET is still in flight.
    const queryStartedAt = toThreadControlTimestamp(NOW)
    mocks.applyThreadControlTransition.mockResolvedValue(null)

    const snapshot = await threadControlService.syncThreadOwner({
      workspaceId: "ws-1",
      contactInbox: owned(),
      conversationId: "conv-1",
      fetchOwner: () => {
        vi.setSystemTime(new Date(NOW.getTime() + 5000))
        return Promise.resolve({ ownerAppId: PARTNER, expiresAt: null })
      },
      ownAppId: OWN,
      businessAiAppId: BOT,
    })

    // Stamped at fetch START, not completion: the guarded write sees the
    // earlier time and so rejects the stale answer against the newer row.
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: queryStartedAt }),
    )
    expect(snapshot.threadControlState).toBe("owned")
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
  })

  test("an app id is never guessed when our own app id is unknown", async () => {
    await threadControlService.syncThreadOwner({
      workspaceId: "ws-1",
      contactInbox: owned(),
      conversationId: "conv-1",
      fetchOwner: () =>
        Promise.resolve({ ownerAppId: PARTNER, expiresAt: null }),
    })

    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })
})

describe("threadControlService.recordEvent — channel expiry lifecycle", () => {
  const EXPIRES_AT = new Date(NOW.getTime() + DAY)
  const events = Object.keys(THREAD_CONTROL_TRANSITIONS) as ThreadControlEvent[]

  const record = (
    event: ThreadControlEvent,
    threadOwnerExpiresAt?: Date | null,
  ) => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow(event, null, NOW),
    )
    return threadControlService.recordEvent({
      workspaceId: "ws-1",
      inbox: inbox(ago(HOUR)),
      contactInbox: makeContactInbox({
        threadControlState: "standby",
        threadControlUpdatedAt: ago(HOUR),
      }),
      conversationId: "conv-1",
      event,
      occurredAt: NOW,
      ...(threadOwnerExpiresAt === undefined ? {} : { threadOwnerExpiresAt }),
    })
  }

  const writtenExpiry = () => {
    const [input] = mocks.applyThreadControlTransition.mock.calls.at(-1) as [
      Record<string, unknown>,
    ]
    return input.threadOwnerExpiresAt
  }

  test.each(
    events.filter((event) => THREAD_CONTROL_TRANSITIONS[event] === "standby"),
  )("standby event %s keeps the stored expiry (undefined)", async (event) => {
    await record(event)
    expect(writtenExpiry()).toBeUndefined()
  })

  test.each(
    events.filter((event) => THREAD_CONTROL_TRANSITIONS[event] !== "standby"),
  )("owned/idle event %s clears the expiry (null)", async (event) => {
    await record(event)
    expect(writtenExpiry()).toBeNull()
  })

  test("an explicit value overrides the derivation", async () => {
    await record("standbyReceived", EXPIRES_AT)
    expect(writtenExpiry()).toEqual(EXPIRES_AT)
    await record("standbyReceived", null)
    expect(writtenExpiry()).toBeNull()
  })
})

describe("threadControlService.syncThreadOwner — channel expiry", () => {
  const OWN = "app-own"
  const PARTNER = "app-partner"
  const EXPIRES_AT = new Date(NOW.getTime() + DAY)

  const sync = (
    contactInbox: ContactInboxModel,
    ownerAppId: string | null,
    expiresAt: Date | null,
  ) =>
    threadControlService.syncThreadOwner({
      workspaceId: "ws-1",
      contactInbox,
      conversationId: "conv-1",
      fetchOwner: () => Promise.resolve({ ownerAppId, expiresAt }),
      ownAppId: OWN,
      businessAiAppId: null,
    })

  const owned = () =>
    makeContactInbox({
      threadControlState: "owned",
      threadControlUpdatedAt: ago(HOUR),
      lastIncomingMessageAt: ago(HOUR),
    })

  const standbyPartner = (extra: Partial<ContactInboxModel> = {}) =>
    makeContactInbox({
      threadControlState: "standby",
      threadOwnerAppId: PARTNER,
      threadControlUpdatedAt: ago(HOUR),
      ...extra,
    } as Partial<ContactInboxModel>)

  test("a partner sync that corrects the row stores the fetched expiry", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue({
      ...appliedRow("standbyReceived", null, NOW),
      threadOwnerAppId: PARTNER,
      threadOwnerExpiresAt: EXPIRES_AT,
    })

    const snapshot = await sync(owned(), PARTNER, EXPIRES_AT)

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ threadOwnerExpiresAt: EXPIRES_AT }),
    )
    expect(snapshot.threadOwnerExpiresAt).toEqual(EXPIRES_AT)
  })

  test("a partner sync with no Meta expiration writes null (falls back to 24h)", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("standbyReceived", null, NOW),
    )
    await sync(owned(), PARTNER, null)
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ threadOwnerExpiresAt: null }),
    )
  })

  test("a self sync clears the expiry", async () => {
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("inboundReceived", null, NOW),
    )
    await sync(standbyPartner(), OWN, EXPIRES_AT)
    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "inboundReceived",
        threadOwnerExpiresAt: null,
      }),
    )
  })

  test("confirming a standby owner stores a newly known expiry without a divider or event", async () => {
    mocks.setStandbyThreadOwnerExpiresAt.mockResolvedValue({
      ...standbyPartner(),
      id: "ci-1",
      threadOwnerExpiresAt: EXPIRES_AT,
    })

    const snapshot = await sync(standbyPartner(), PARTNER, EXPIRES_AT)

    expect(mocks.setStandbyThreadOwnerExpiresAt).toHaveBeenCalledWith({
      id: "ci-1",
      workspaceId: "ws-1",
      ownerAppId: PARTNER,
      observedUpdatedAt: standbyPartner().threadControlUpdatedAt,
      threadOwnerExpiresAt: EXPIRES_AT,
    })
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
    expect(mocks.createOrUpdate).not.toHaveBeenCalled()
    expect(mocks.publishToWorkspaceParty).toHaveBeenCalledTimes(1)
    expect(snapshot.threadOwnerExpiresAt).toEqual(EXPIRES_AT)
  })

  test("an expiry write refused by the version guard (owner went A -> us -> A during the fetch) changes nothing and is not announced", async () => {
    mocks.setStandbyThreadOwnerExpiresAt.mockResolvedValue(null)

    const snapshot = await sync(standbyPartner(), PARTNER, EXPIRES_AT)

    expect(mocks.setStandbyThreadOwnerExpiresAt).toHaveBeenCalledTimes(1)
    expect(mocks.publishToWorkspaceParty).not.toHaveBeenCalled()
    expect(snapshot.threadOwnerExpiresAt).toBeNull()
  })

  test("confirming with an unchanged expiry writes nothing", async () => {
    await sync(
      standbyPartner({ threadOwnerExpiresAt: EXPIRES_AT }),
      PARTNER,
      EXPIRES_AT,
    )
    expect(mocks.setStandbyThreadOwnerExpiresAt).not.toHaveBeenCalled()
    expect(mocks.applyThreadControlTransition).not.toHaveBeenCalled()
  })

  test("confirming an owned thread never touches the expiry", async () => {
    await sync(owned(), OWN, EXPIRES_AT)
    expect(mocks.setStandbyThreadOwnerExpiresAt).not.toHaveBeenCalled()
  })
})
