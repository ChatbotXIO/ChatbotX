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
      occurredAt,
    })
    expect(result).toMatchObject({ eventApplied: true, stateChanged: true })
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
        threadControlUpdatedAt: occurredAt.toISOString(),
        threadControlLastEvent: "controlPassed",
      },
    })
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

  const repeatTake = (applyOnChannel: () => Promise<void>) =>
    threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "take",
      ownerRole: "escalation",
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
      return Promise.resolve()
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

    const snapshot = await repeatTake(vi.fn().mockResolvedValue(undefined))

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
    const applyOnChannel = vi.fn().mockResolvedValue(undefined)
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
      threadControlUpdatedAt: NOW,
      threadControlLastEvent: event,
    })
  })

  test("records the owner role the caller knows (our own pass → escalation)", async () => {
    mocks.findModelByIdForWorkspace.mockResolvedValue(makeContactInbox())
    mocks.applyThreadControlTransition.mockResolvedValue(
      appliedRow("passed", "escalation", NOW),
    )

    const snapshot = await threadControlService.requestAction({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "pass",
      ownerRole: "escalation",
      applyOnChannel: vi.fn().mockResolvedValue(undefined),
    })

    expect(mocks.applyThreadControlTransition).toHaveBeenCalledWith(
      expect.objectContaining({ event: "passed", ownerRole: "escalation" }),
    )
    expect(snapshot.threadOwnerRole).toBe("escalation")
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
  const row = (overrides: Record<string, unknown>) => ({
    id: "ci-1",
    contactId: "contact-1",
    inboxId: "inbox-1",
    threadControlState: "owned",
    threadControlUpdatedAt: ago(HOUR),
    lastIncomingMessageAt: ago(HOUR),
    ...overrides,
  })

  test("enqueues one deduplicated release job per still-owned thread", async () => {
    const updatedAt = ago(HOUR)
    mocks.listThreadControlledByContactIds.mockResolvedValue([
      row({ threadControlUpdatedAt: updatedAt }),
    ])

    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
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
      },
    })
    expect(options.jobId).toBe(`thread-release-ci-1-${updatedAt.getTime()}`)
    expect(options.jobId).not.toContain(":")
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
    })

    expect(mocks.enqueueIntegrationJob).toHaveBeenCalledTimes(1)
  })

  test("no owned rows, or no conversations, enqueue nothing and skip the query when empty", async () => {
    mocks.listThreadControlledByContactIds.mockResolvedValue([])
    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations,
    })
    await threadControlService.releaseOwnedThreadsForContacts({
      workspaceId: "ws-1",
      conversations: [],
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
