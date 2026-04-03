import { and, db, eq, inArray } from "@aha.chat/database/client"
import { contactModel, conversationModel } from "@aha.chat/database/schema"
import { query } from "@chatbotx.io/clickhouse/client"
import type { ClickHouseContactResponseRow } from "@chatbotx.io/clickhouse/schemas"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  BroadcastContactData,
  BroadcastEventType,
  ListBroadcastContactsResponse,
} from "../schemas/broadcast-contacts"

export async function listBroadcastContacts(input: {
  chatbotId: string
  broadcastId: string
  eventType: BroadcastEventType
  total?: number
  page: number
  perPage: number
}): Promise<ListBroadcastContactsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  // set default total to 0 if not provided
  const { chatbotId, broadcastId, eventType, page, total, perPage } = input
  const totalValue: number = total || 0
  const offset = (page - 1) * perPage

  let eventTypeFilter: string[]
  if (eventType === "sent") {
    eventTypeFilter = ["delivered", "failed"]
  } else {
    eventTypeFilter = [eventType]
  }

  const contactRows = await query<
    ClickHouseContactResponseRow & { max_occurred_at: string }
  >(
    `
      SELECT
        contact_id,
        argMax(content, occurred_at) as content,
        max(occurred_at) as max_occurred_at
      FROM broadcast_events
      WHERE chatbot_id = {chatbotId:String}
        AND broadcast_id = {broadcastId:String}
        AND batch_id = 1
        AND event_type in {eventTypeFilter:Array(String)}
      GROUP BY contact_id
      ORDER BY max_occurred_at DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
    {
      chatbotId,
      broadcastId,
      eventTypeFilter,
      limit: perPage,
      offset,
    },
  )
  const pageCount = Math.ceil(totalValue / perPage)

  if (contactRows.length === 0) {
    return {
      data: [],
      total: totalValue,
      page,
      pageCount,
    }
  }

  const contactIds = contactRows.map((row) => row.contact_id)
  const errorContentMap = new Map<string, string | null>()
  const occurredAtMap = new Map<string, string>()

  for (const row of contactRows) {
    occurredAtMap.set(row.contact_id, row.max_occurred_at)
    if (row.content) {
      try {
        const parsed = JSON.parse(row.content)
        if (parsed.error) {
          const errorMsg =
            typeof parsed.error === "string"
              ? parsed.error
              : (parsed.error.message ?? JSON.stringify(parsed.error))
          errorContentMap.set(row.contact_id, errorMsg)
        }
      } catch {
        errorContentMap.set(row.contact_id, null)
      }
    }
  }

  const contacts = await db
    .select({
      id: contactModel.id,
      firstName: contactModel.firstName,
      lastName: contactModel.lastName,
      sourceId: contactModel.sourceId,
      avatar: contactModel.avatar,
      channel: contactModel.channel,
    })
    .from(contactModel)
    .where(inArray(contactModel.id, contactIds))

  const conversations = await db
    .select({
      id: conversationModel.id,
      contactId: conversationModel.contactId,
    })
    .from(conversationModel)
    .where(
      and(
        inArray(conversationModel.contactId, contactIds),
        eq(conversationModel.chatbotId, chatbotId),
      ),
    )

  const contactMap = new Map(contacts.map((c) => [c.id, c]))
  const conversationMap = new Map(conversations.map((c) => [c.contactId, c.id]))

  const data: BroadcastContactData[] = contactRows
    .map((row) => {
      const contact = contactMap.get(row.contact_id)
      if (!contact) {
        return null
      }
      const conversationId = conversationMap.get(contact.id)
      if (!conversationId) {
        return null
      }

      return {
        contactId: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        sourceId: contact.sourceId,
        avatar: contact.avatar,
        channel: contact.channel,
        conversationId,
        errorContent: errorContentMap.get(row.contact_id) ?? null,
        occurredAt: occurredAtMap.get(row.contact_id) ?? null,
      }
    })
    .filter((c): c is BroadcastContactData => c !== null)

  return {
    data,
    total: totalValue,
    page,
    pageCount,
  }
}
