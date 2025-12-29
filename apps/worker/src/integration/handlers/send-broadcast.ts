import { BroadcastStatus, prisma } from "@aha.chat/database"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"

export const sendBroadcast = async (broadcastId: string) => {
  const broadcast = await prisma.broadcast.findFirstOrThrow({
    where: {
      id: broadcastId,
      status: BroadcastStatus.scheduled,
    },
  })

  const contactsOnBroadcasts = await prisma.contactsOnBroadcasts.findMany({
    where: {
      broadcastId,
    },
  })
  if (contactsOnBroadcasts.length === 0) {
    return
  }

  const conversations = await prisma.conversation.findMany({
    where: {
      contactId: {
        in: contactsOnBroadcasts.map((cb) => cb.contactId),
      },
    },
    select: {
      id: true,
    },
  })

  await Promise.all(
    conversations.map(async (cvst) => {
      await integrationQueue.add(IntegrationJobAction.sendFlow, {
        type: IntegrationJobAction.sendFlow,
        data: {
          flowId: broadcast.flowId,
          conversationId: cvst.id,
        },
      })
    }),
  )
}
