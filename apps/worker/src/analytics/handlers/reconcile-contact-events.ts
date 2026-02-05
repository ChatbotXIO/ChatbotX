import { contactTrackingService, query } from "@aha.chat/analytics"
import { prisma } from "@aha.chat/database"
import type { ScheduleJobReconcileContactEvents } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 1000

export const reconcileContactEvents = async (
  job: ScheduleJobReconcileContactEvents,
) => {
  const { chatbotId, fromDate, toDate } = job.data

  logger.info(
    `Starting reconciliation for chatbot ${chatbotId} from ${fromDate} to ${toDate}`,
  )

  const from = new Date(fromDate)
  const to = new Date(toDate)

  const fromTimestamp = Math.floor(from.getTime() / 1000)
  const toTimestamp = Math.floor(to.getTime() / 1000)

  const existingContactIds = await query<{ contact_id: string }>(
    `
    SELECT DISTINCT contact_id
    FROM contact_events
    WHERE chatbot_id = {chatbotId:String}
      AND event_type = 'contact_created'
      AND occurred_at >= {from:UInt32}
      AND occurred_at < {to:UInt32}
  `,
    {
      chatbotId,
      from: fromTimestamp,
      to: toTimestamp,
    },
  )

  const existingIds = new Set(existingContactIds.map((r) => r.contact_id))

  logger.info(
    `Found ${existingIds.size} existing contacts in ClickHouse for the time range`,
  )

  let skip = 0
  let reconciledCount = 0

  while (true) {
    const contacts = await prisma.contact.findMany({
      where: {
        chatbotId,
        createdAt: {
          gte: from,
          lt: to,
        },
      },
      select: {
        id: true,
        chatbotId: true,
        createdAt: true,
        source: true,
        sourceId: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      skip,
      take: BATCH_SIZE,
    })

    if (contacts.length === 0) {
      break
    }

    const missingContacts = contacts.filter(
      (c) => Boolean(c.sourceId) && !existingIds.has(c.sourceId as string),
    )

    if (missingContacts.length > 0) {
      const events = missingContacts.map((contact) => ({
        chatbotId: contact.chatbotId,
        contactId: contact.sourceId as string,
        eventType: "contact_created" as const,
        occurredAt: contact.createdAt,
        source: contact.source,
        sourceId: contact.sourceId as string,
      }))

      try {
        await contactTrackingService.trackEvents(events)
        reconciledCount += missingContacts.length
        logger.info(
          `Reconciled ${reconciledCount} missing contacts for chatbot ${chatbotId}`,
        )
      } catch (error) {
        logger.error(
          `Failed to reconcile contacts for chatbot ${chatbotId}`,
          error,
        )
      }
    }

    skip += BATCH_SIZE

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  logger.info(
    `Reconciliation completed for chatbot ${chatbotId}: ${reconciledCount} contacts added`,
  )
}
