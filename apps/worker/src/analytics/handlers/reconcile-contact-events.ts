import { contactTrackingService } from "@chatbotx.io/analytics"
import { query } from "@chatbotx.io/clickhouse/client"
import { and, db, eq, gte, lt } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 1000

export const reconcileContactEvents = async (job: {
  data: { workspaceId: string; fromDate: string; toDate: string }
}) => {
  const { workspaceId, fromDate, toDate } = job.data

  // logger.info(
  //   `Starting reconciliation for workspace ${workspaceId} from ${fromDate} to ${toDate}`,
  // )

  const from = new Date(fromDate)
  const to = new Date(toDate)

  const fromTimestamp = Math.floor(from.getTime() / 1000)
  const toTimestamp = Math.floor(to.getTime() / 1000)

  const existingContactIds = await query<{ contact_id: string }>(
    `
    SELECT DISTINCT contact_id
    FROM contact_events
    WHERE workspace_id = {workspaceId:String}
      AND event_type = 'contact_created'
      AND occurred_at >= {from:UInt32}
      AND occurred_at < {to:UInt32}
  `,
    {
      workspaceId,
      from: fromTimestamp,
      to: toTimestamp,
    },
  )

  const existingIds = new Set(existingContactIds.map((r) => r.contact_id))

  // logger.info(
  //   `Found ${existingIds.size} existing contacts in ClickHouse for the time range`,
  // )

  let offset = 0

  while (true) {
    const contacts = await db
      .select({
        id: contactModel.id,
        workspaceId: contactModel.workspaceId,
        createdAt: contactModel.createdAt,
        source: contactModel.source,
        sourceId: contactModel.sourceId,
      })
      .from(contactModel)
      .where(
        and(
          eq(contactModel.workspaceId, workspaceId),
          gte(contactModel.createdAt, from),
          lt(contactModel.createdAt, to),
        ),
      )
      .orderBy(contactModel.createdAt)
      .limit(BATCH_SIZE)
      .offset(offset)

    if (contacts.length === 0) {
      break
    }

    const missingContacts = contacts.filter(
      (c) => Boolean(c.sourceId) && !existingIds.has(c.sourceId ?? ""),
    )

    if (missingContacts.length > 0) {
      const events = missingContacts.map((contact) => ({
        workspaceId: contact.workspaceId,
        contactId: contact.id,
        eventType: "contact_created" as const,
        occurredAt: contact.createdAt,
        source: contact.source,
        sourceId: contact.sourceId as string,
      }))

      try {
        await contactTrackingService.trackEvents(events)
        // logger.info(
        //   `Reconciled ${missingContacts.length} missing contacts for workspace ${workspaceId}`,
        // )
      } catch (error) {
        logger.error(
          error,
          `Failed to reconcile contacts for workspace ${workspaceId}`,
        )
      }
    }

    offset += BATCH_SIZE

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  // logger.info(
  //   `Reconciliation completed for workspace ${workspaceId}`,
  // )
}
