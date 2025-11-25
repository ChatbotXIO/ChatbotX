"use server"

import {
  BroadcastSchedulesType,
  BroadcastStatus,
  type Prisma,
  prisma,
} from "@aha.chat/database"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { BroadcastException } from "../schemas/exception"

export const resendBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id] }) => {
    const broadcast = await prisma.broadcast.findFirstOrThrow({
      where: {
        id,
        chatbotId,
      },
    })
    if (broadcast.status !== BroadcastStatus.sent) {
      throw new BroadcastException("Broadcast is not sent")
    }

    const contactsOnBroadcasts = await prisma.contactsOnBroadcasts.findMany({
      where: {
        broadcastId: id,
      },
    })

    const newBroadcast = await prisma.$transaction(
      async (tx) =>
        await tx.broadcast.create({
          data: {
            chatbotId,
            flowId: broadcast.flowId,
            inboxType: broadcast.inboxType,
            subaction: broadcast.subaction,
            status: BroadcastStatus.sent,
            schedulesType: BroadcastSchedulesType.now,
            schedulesAt: new Date(),
            contactFilter: broadcast.contactFilter as Prisma.InputJsonObject,
            name: `${broadcast.name} (Resend)`,
            contacts: {
              create: contactsOnBroadcasts.map((contact) => ({
                contactId: contact.contactId,
              })),
            },
          },
        }),
    )

    await integrationQueue.add(IntegrationJobAction.sendBroadcast, {
      type: IntegrationJobAction.sendBroadcast,
      data: {
        broadcastId: newBroadcast.id,
      },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
  })
