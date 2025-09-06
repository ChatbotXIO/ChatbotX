"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateWebchatRequest } from "../schemas/webchat.schema"

export const updateWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .inputSchema(updateWebchatRequest)
  .action(async ({ parsedInput, bindArgsParsedInputs: [chatbotId, id] }) => {
    const integration = await prisma.integrationChatWidget.findFirstOrThrow({
      where: {
        id,
        chatbotId,
      },
    })

    await prisma.$transaction(async (tx) => {
      await tx.integrationChatWidget.update({
        where: {
          id: integration.id,
        },
        data: parsedInput,
      })
    })

    revalidateTag(`chatbots:${chatbotId}#webchats`)
  })
