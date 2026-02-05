import { contactTrackingService } from "@aha.chat/analytics"
import { prisma } from "@aha.chat/database"
import type { ScheduleJobBackfillContactEvents } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 1000

export const backfillContactEvents = async (
  _job: ScheduleJobBackfillContactEvents,
) => {
  logger.info("Starting backfill of contact events to ClickHouse")

  const chatbots = await prisma.chatbot.findMany({
    select: { id: true },
  })

  logger.info(`Found ${chatbots.length} chatbots to process`)

  for (const chatbot of chatbots) {
    let skip = 0
    let processedCount = 0

    while (true) {
      const contacts = await prisma.contact.findMany({
        where: {
          chatbotId: chatbot.id,
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

      const events = contacts
        .filter((contact) => Boolean(contact.sourceId))
        .map((contact) => ({
          chatbotId: contact.chatbotId,
          contactId: contact.sourceId as string,
          eventType: "contact_created" as const,
          occurredAt: contact.createdAt,
          source: contact.source,
          sourceId: contact.sourceId as string,
        }))

      try {
        await contactTrackingService.trackEvents(events)
        processedCount += contacts.length
        logger.info(
          `Backfilled ${processedCount} contacts for chatbot ${chatbot.id}`,
        )
      } catch (error) {
        logger.error(
          `Failed to backfill contacts for chatbot ${chatbot.id}`,
          error,
        )
      }

      skip += BATCH_SIZE

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    logger.info(
      `Completed backfill for chatbot ${chatbot.id}: ${processedCount} contacts`,
    )
  }

  logger.info("Backfill completed for all chatbots")
}
