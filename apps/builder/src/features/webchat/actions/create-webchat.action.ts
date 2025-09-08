"use server"

import { InboxType, prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { createWebchatRequest } from "../schemas/webchat.schema"

export const createWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, bindArgsParsedInputs: [chatbotId] }) => {
    await prisma.$transaction(async (tx) => {
      const inbox = await tx.inbox.create({
        data: {
          chatbotId,
          inboxType: InboxType.WEBCHAT,
        },
      })
      await tx.integrationWebchat.create({
        data: {
          ...parsedInput,
          chatbotId,
          inboxId: inbox.id,
          auth: "{}",
        },
      })
    })

    revalidateTag(`chatbots:${chatbotId}#webchats`)
  })
