import { InboxType, prisma } from "@aha.chat/database"
import type { MessengerWebhookEvent } from "@aha.chat/integration-messenger"
import type { WhatsappWebhookEvent } from "@aha.chat/integration-whatsapp"
import type { ZaloWebhookEvent } from "@aha.chat/integration-zalo"
import { allIntegrations, getDBIntegration } from "../../shared/integrations"

export const readMessage = async ({
  integrationType,
  payload,
}: {
  integrationType: string
  payload: WhatsappWebhookEvent | MessengerWebhookEvent | ZaloWebhookEvent
}) => {
  if (!Object.hasOwn(allIntegrations, integrationType)) {
    throw new Error(`Unsupported integration: ${integrationType}`)
  }
  const dbIntegration = await getDBIntegration(integrationType, payload)
  const { chatbotId } = dbIntegration

  const conversation = await prisma.conversation.findFirstOrThrow({
    where: {
      chatbotId,
      sourceId: (() => {
        switch (integrationType) {
          case InboxType.whatsapp:
            return (payload as WhatsappWebhookEvent).from
          case InboxType.messenger:
            return (payload as MessengerWebhookEvent).entry[0].messaging[0]
              .recipient.id
          case InboxType.zalo:
            return (payload as ZaloWebhookEvent).recipient.id
          default:
            throw new Error(`Unsupported integration: ${integrationType}`)
        }
      })(),
    },
  })

  await prisma.conversation.update({
    where: {
      id: conversation.id,
    },
    data: {
      contactLastSeenAt: (() => {
        switch (integrationType) {
          case InboxType.messenger: {
            const watermark = (payload as MessengerWebhookEvent).entry[0]
              .messaging[0].read?.watermark
            return new Date(watermark ?? Date.now())
          }
          case InboxType.zalo:
            return new Date(Number((payload as ZaloWebhookEvent).timestamp))
          default:
            return new Date()
        }
      })(),
    },
  })
}
