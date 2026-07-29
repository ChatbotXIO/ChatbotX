import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { MatchableEventType } from "@chatbotx.io/events"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { WebhookWithConditions } from "../src/webhook/types"

const { assertPublicUrl, contactFindById, listCustomFields, tagFindFirst } =
  vi.hoisted(() => ({
    assertPublicUrl: vi.fn().mockResolvedValue(undefined),
    contactFindById: vi.fn(),
    listCustomFields: vi.fn(),
    tagFindFirst: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl,
  contactCustomFieldService: { listWithDefinitions: listCustomFields },
  contactService: { findById: contactFindById },
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
const { buildWebhookPayload } = await import(
  "../src/webhook/services/webhook-payload.builder"
)

const timestamp = new Date("2026-07-11T10:00:00.000Z")
const webhook = {
  id: "webhook-1",
  url: "https://example.com/webhook",
} as WebhookWithConditions

type TagQuery = { where: { id: string; workspaceId?: string } }

// Tag ids are globally unique, so an id-only lookup resolves a row from any
// workspace. These rows let the mock mimic SQL semantics — a `where` without
// `workspaceId` matches across workspaces — instead of hiding the difference.
const tagRows = [
  { id: "tag-1", workspaceId: "workspace-1", name: "VIP" },
  {
    id: "tag-foreign",
    workspaceId: "workspace-2",
    name: "Other workspace tag",
  },
]

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
    // The contact row is committed before `emitContactCreated` fires, so the
    // stored record — not the event metadata — is the source of truth here.
    // `customFields` is never populated by any emitter; only the database read
    // can fill `custom_fields`.
    eventType: triggerEventTypes.enum.newContact,
    metadata: {
      name: "Ada",
      phone: "+15550000000",
      email: "stale@example.com",
    },
    expectedPayload: {
      ...basePayload("new_contact"),
      name: "Ada Lovelace",
      first_name: "Ada",
      last_name: "Lovelace",
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
    contactFindById.mockResolvedValue({
      id: "contact-1",
      fullName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      phoneNumber: "+15551234567",
      email: "ada@example.com",
    })
    listCustomFields.mockResolvedValue([{ name: "plan", value: "Pro" }])
    vi.stubGlobal("fetch", fetchMock)
  })

  test.each(payloadCases)("sends the current payload for $eventType", async ({
    eventType,
    metadata,
    expectedPayload,
  }) => {
    const executor = new WebhookExecutor()

    const payload = await buildWebhookPayload({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      eventType,
      eventData: metadata,
      timestamp,
    })
    await executor.execute({ webhook, payload })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual(expectedPayload)
  })

  // The tag id arrives as event metadata, so it must never be trusted to belong
  // to the workspace the webhook is registered under. An id-only lookup would
  // put another tenant's tag name in this workspace's outbound payload.
  test("does not leak a tag that belongs to another workspace", async () => {
    tagFindFirst.mockImplementation((query: TagQuery) =>
      Promise.resolve(
        tagRows.find(
          (row) =>
            row.id === query.where.id &&
            (query.where.workspaceId === undefined ||
              row.workspaceId === query.where.workspaceId),
        ),
      ),
    )

    const payload = await buildWebhookPayload({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      eventType: triggerEventTypes.enum.tagApplied,
      eventData: { tagId: "tag-foreign" },
      timestamp,
    })

    // Asserted on the raw payload, so `timestamp` is still a Date here — the
    // other cases assert the serialized request body instead.
    expect(payload).toEqual({
      event: "tag_applied",
      contact_id: "contact-1",
      timestamp,
      tag: "",
    })
  })

  // A contact deleted between the event and the delivery attempt must still
  // produce a well-formed payload: the subscriber's parser would break on
  // missing keys, so every field falls back to the metadata or to null.
  test("falls back to event metadata when the contact no longer exists", async () => {
    contactFindById.mockResolvedValue(undefined)
    const executor = new WebhookExecutor()

    const payload = await buildWebhookPayload({
      workspaceId: "workspace-1",
      contactId: "contact-1",
      eventType: triggerEventTypes.enum.newContact,
      eventData: { name: "Ada", phone: "+15550000000" },
      timestamp,
    })
    await executor.execute({ webhook, payload })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      ...basePayload("new_contact"),
      name: "Ada",
      first_name: null,
      last_name: null,
      phone: "+15550000000",
      email: null,
      custom_fields: {},
    })
    expect(listCustomFields).not.toHaveBeenCalled()
  })
})
