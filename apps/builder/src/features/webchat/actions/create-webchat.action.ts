"use server"

import { InboxType, prisma } from "@aha.chat/database"
import { createId } from "@paralleldrive/cuid2"
import { revalidateTag } from "next/cache"
import { chatbotIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { createWebchatRequest } from "../schemas/webchat.schema"

export const createWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createWebchatRequest)
  .action(async ({ parsedInput, bindArgsParsedInputs: [chatbotId] }) => {
    const { authorizedDomains, ...rest } = parsedInput

    await prisma.$transaction(async (tx) => {
      const inbox = await tx.inbox.create({
        data: {
          chatbotId,
          inboxType: InboxType.WEBCHAT,
          sourceId: createId(),
        },
      })
      await tx.integrationWebchat.create({
        data: {
          ...rest,
          authorizedDomains: authorizedDomains.map((domain) => domain.value),
          chatbotId,
          inboxId: inbox.id,
          auth: "{}",
        },
      })
    })

    revalidateTag(`chatbots:${chatbotId}#webchats`)
  })
