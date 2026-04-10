import { db, inArray } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import { query } from "@chatbotx.io/clickhouse/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  BroadcastContactResource,
  BroadcastEventType,
  ListBroadcastContactsResponse,
} from "../schemas/broadcast-contacts"

type ClickHouseContactRow = {
  contact_id: string
  content: string | null
}

type ClickHouseCountRow = {
  total: string
}

export async function listBroadcastContacts(input: {
  chatbotId: string
  broadcastId: string
  eventType: BroadcastEventType
  page: number
  perPage: number
}): Promise<ListBroadcastContactsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const { chatbotId, broadcastId, eventType, page, perPage } = input
  const offset = (page - 1) * perPage

  const [contactRows, countRows] = await Promise.all([
    query<ClickHouseContactRow>(
      `
      SELECT 
        contact_id,
        argMax(content, occurred_at) as content
      FROM broadcast_events
      WHERE chatbot_id = {chatbotId:String}
        AND broadcast_id = {broadcastId:String}
        AND batch_id = 1
        AND event_type = {eventType:String}
      GROUP BY contact_id
      ORDER BY max(occurred_at) DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
      `,
      {
        chatbotId,
        broadcastId,
        eventType,
        limit: perPage,
        offset,
      },
    ),
    query<ClickHouseCountRow>(
      `
      SELECT uniq(contact_id) as total
      FROM broadcast_events
      WHERE chatbot_id = {chatbotId:String}
        AND broadcast_id = {broadcastId:String}
        AND batch_id = 1
        AND event_type = {eventType:String}
      `,
      {
        chatbotId,
        broadcastId,
        eventType,
      },
    ),
  ])

  const total = Number.parseInt(countRows[0]?.total ?? "0", 10)
  const pageCount = Math.ceil(total / perPage)

  if (contactRows.length === 0) {
    return {
      data: [],
      total,
      page,
      pageCount,
    }
  }

  const contactIds = contactRows.map((row) => row.contact_id)
  const errorContentMap = new Map<string, string | null>()

  for (const row of contactRows) {
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

  const contactMap = new Map(contacts.map((c) => [c.id, c]))

  const data: BroadcastContactResource[] = contactRows
    .map((row) => {
      const contact = contactMap.get(row.contact_id)
      if (!contact) {
        return null
      }
      return {
        contactId: contact.id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        sourceId: contact.sourceId,
        avatar: contact.avatar,
        channel: contact.channel,
        errorContent: errorContentMap.get(row.contact_id) ?? null,
      }
    })
    .filter((c): c is BroadcastContactResource => c !== null)

  return {
    data,
    total,
    page,
    pageCount,
  }
}
