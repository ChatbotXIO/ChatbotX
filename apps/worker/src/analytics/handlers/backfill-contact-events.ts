import { db } from "@aha.chat/database/client"
import { contactTrackingService } from "@chatbotx.io/analytics"
import { logger } from "../../lib/logger"

const BATCH_SIZE = 1000

export const backfillContactEvents = async () => {
  // logger.info("Starting backfill of contact events to ClickHouse")

  const chatbots = await db.query.chatbotModel.findMany({
    columns: { id: true },
  })

  // logger.info(`Found ${chatbots.length} chatbots to process`)

  for (const chatbot of chatbots) {
    let skip = 0

    while (true) {
      const contacts = await db.query.contactModel.findMany({
        where: { chatbotId: chatbot.id },
        columns: {
          id: true,
          chatbotId: true,
          createdAt: true,
          channel: true,
          source: true,
          sourceId: true,
        },
        with: {
          conversation: {
            columns: {
              channel: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        offset: skip,
        limit: BATCH_SIZE,
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
          channel: contact.conversation?.channel || "",
        }))

      try {
        await contactTrackingService.trackEvents(events)
        // logger.info(
        //   `Backfilled ${contacts.length} contacts for chatbot ${chatbot.id}`,
        // )
      } catch (error) {
        logger.error(
          error,
          `Failed to backfill contacts for chatbot ${chatbot.id}`,
        )
      }

      skip += BATCH_SIZE

      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // logger.info(
    //   `Completed backfill for chatbot ${chatbot.id}: ${processedCount} contacts`,
    // )
  }

  // logger.info("Backfill completed for all chatbots")
}
