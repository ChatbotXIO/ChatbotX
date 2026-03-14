"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import {
  broadcastModel,
  contactsOnBroadcastsModel,
} from "@aha.chat/database/schema"
import type { BroadcastModel } from "@aha.chat/database/types"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"

export const resendBroadcastAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id] }) => {
    const broadcast = await findOrFail<BroadcastModel>(broadcastModel, {
      id,
      chatbotId,
    })
    if (broadcast.status !== "sent") {
      throw new ChatbotXException("Broadcast is not sent")
    }

    const newBroadcast = await db.transaction(async (tx) => {
      const newBroadcast = await tx
        .insert(broadcastModel)
        .values({
          chatbotId,
          flowId: broadcast.flowId,
          inboxType: broadcast.inboxType,
          subaction: broadcast.subaction,
          status: "sent",
          schedulesType: "now",
          schedulesAt: new Date(),
          contactFilter: broadcast.contactFilter,
          name: `${broadcast.name} (Resend)`,
          id: createId(),
        })
        .returning()
        .then((result) => result[0])

      const linkedContacts = await tx.query.contactsOnBroadcastsModel.findMany({
        columns: {
          contactId: true,
        },
        where: {
          broadcastId: broadcast.id,
        },
      })

      await tx.insert(contactsOnBroadcastsModel).values(
        linkedContacts.map((contact) => ({
          broadcastId: newBroadcast.id,
          contactId: contact.contactId,
        })),
      )

      return newBroadcast
    })

    await integrationQueue.add(IntegrationJobAction.sendBroadcast, {
      type: IntegrationJobAction.sendBroadcast,
      data: {
        broadcastId: newBroadcast.id,
      },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#broadcasts`)
  })
