import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { MatchableEventType } from "@chatbotx.io/events"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { WebhookWithConditions } from "../src/webhook/types"

const { assertPublicUrl, tagFindFirst } = vi.hoisted(() => ({
  assertPublicUrl: vi.fn().mockResolvedValue(undefined),
  tagFindFirst: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: {
        findFirst: tagFindFirst,
      },
    },
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

const { WebhookExecutor } = await import(
  "../src/webhook/services/webhook-executor.service"
)

const timestamp = new Date("2026-07-11T10:00:00.000Z")
const webhook = {
  id: "webhook-1",
  url: "https://example.com/webhook",
} as WebhookWithConditions

type PayloadCase = {
  eventType: MatchableEventType
  metadata: Record<string, unknown>
  expectedPayload: Record<string, unknown>
}

const basePayload = (event: string) => ({
  event,
  contact_id: "contact-1",
  timestamp: timestamp.toISOString(),
})

const payloadCases = [
  {
    eventType: triggerEventTypes.enum.tagApplied,
    metadata: { tagId: "tag-1" },
    expectedPayload: { ...basePayload("tag_applied"), tag: "VIP" },
  },
  {
    eventType: triggerEventTypes.enum.tagRemoved,
    metadata: { tagId: "tag-1" },
    expectedPayload: { ...basePayload("tag_removed"), tag: "VIP" },
  },
  {
    eventType: triggerEventTypes.enum.customFieldValueChanged,
    metadata: {
      customFieldName: "Plan",
      oldValue: "Free",
      newValue: "Pro",
    },
    expectedPayload: {
      ...basePayload("custom_field_changed"),
      custom_field: {
        name: "Plan",
        old_value: "Free",
        new_value: "Pro",
      },
    },
  },
  {
    eventType: triggerEventTypes.enum.conversationTransferredToHuman,
    metadata: { conversationId: "conversation-1", transferredBy: "bot" },
    expectedPayload: {
      ...basePayload("conversation_transferred_to_human"),
      conversation_id: "conversation-1",
      transferred_by: "bot",
    },
  },
  {
    eventType: triggerEventTypes.enum.conversationTransferredToBot,
    metadata: { conversationId: "conversation-1" },
    expectedPayload: {
      ...basePayload("conversation_transferred_to_bot"),
      conversation_id: "conversation-1",
      transferred_by: "system",
    },
  },
  {
    eventType: triggerEventTypes.enum.newContact,
    metadata: {
      name: "Ada",
      phone: "+15551234567",
      email: "ada@example.com",
      customFields: { plan: "Pro" },
    },
    expectedPayload: {
      ...basePayload("new_contact"),
      name: "Ada",
      phone: "+15551234567",
      email: "ada@example.com",
      custom_fields: { plan: "Pro" },
    },
  },
  {
    eventType: triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
    metadata: {},
    expectedPayload: basePayload("contact_unsubscribed"),
  },
  {
    eventType: triggerEventTypes.enum.archived,
    metadata: { conversationId: "conversation-1" },
    expectedPayload: {
      ...basePayload("conversation_archived"),
      conversation_id: "conversation-1",
      archived_by: "system",
    },
  },
  {
    eventType: triggerEventTypes.enum.followUp,
    metadata: { conversationId: "conversation-1", markedBy: "agent-1" },
    expectedPayload: {
      ...basePayload("marked_as_follow_up"),
      conversation_id: "conversation-1",
      marked_by: "agent-1",
    },
  },
  {
    eventType: triggerEventTypes.enum.conversationAssigned,
    metadata: {
      conversationId: "conversation-1",
      assignedTo: "agent-2",
      assignedBy: "agent-1",
    },
    expectedPayload: {
      ...basePayload("conversation_assigned"),
      conversation_id: "conversation-1",
      assigned_to: "agent-2",
      assigned_by: "agent-1",
    },
  },
  {
    eventType: triggerEventTypes.enum.conversationUnassigned,
    metadata: { conversationId: "conversation-1" },
    expectedPayload: {
      ...basePayload("conversation_unassigned"),
      conversation_id: "conversation-1",
      unassigned_by: "system",
    },
  },
  {
    eventType: triggerEventTypes.enum.subscribedToSequence,
    metadata: { sequenceId: "sequence-1", sequenceName: "Welcome" },
    expectedPayload: {
      ...basePayload("subscribed_to_sequence"),
      sequence_id: "sequence-1",
      sequence_name: "Welcome",
    },
  },
  {
    eventType: triggerEventTypes.enum.unsubscribedFromSequence,
    metadata: { sequenceId: "sequence-1", sequenceName: "Welcome" },
    expectedPayload: {
      ...basePayload("unsubscribed_from_sequence"),
      sequence_id: "sequence-1",
      sequence_name: "Welcome",
    },
  },
  {
    eventType: triggerEventTypes.enum.contactReferredANewContact,
    metadata: { refName: "Summer", reflinkId: "reflink-1" },
    expectedPayload: {
      ...basePayload("contact_referred_a_new_contact"),
      ref_name: "Summer",
      reflink_id: "reflink-1",
    },
  },
  {
    eventType: triggerEventTypes.enum.contactReferredExistingContact,
    metadata: { refName: "Summer", reflinkId: "reflink-1" },
    expectedPayload: {
      ...basePayload("contact_referred_existing_contact"),
      ref_name: "Summer",
      reflink_id: "reflink-1",
    },
  },
  {
    eventType: triggerEventTypes.enum.dateTimeBasedTrigger,
    metadata: { sourceId: "custom-field-1" },
    expectedPayload: {
      ...basePayload("datetime_based_trigger"),
      sourceId: "custom-field-1",
    },
  },
] satisfies PayloadCase[]

describe("WebhookExecutor payloads", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    tagFindFirst.mockResolvedValue({ name: "VIP" })
    vi.stubGlobal("fetch", fetchMock)
  })

  test.each(payloadCases)("sends the current payload for $eventType", async ({
    eventType,
    metadata,
    expectedPayload,
  }) => {
    const executor = new WebhookExecutor()

    await executor.execute({
      webhook,
      eventData: {
        workspaceId: "workspace-1",
        contactId: "contact-1",
        eventType,
        eventData: metadata,
        timestamp,
      },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual(expectedPayload)
  })
})
