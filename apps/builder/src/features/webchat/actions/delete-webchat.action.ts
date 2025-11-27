"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id] }) => {
    const integration = await prisma.integrationWebchat.findFirstOrThrow({
      where: {
        id,
        chatbotId,
      },
    })

    await prisma.integrationWebchat.delete({
      where: {
        id: integration.id,
      },
    })

    revalidateCacheTags(`chatbots:${chatbotId}#webchats`)
  })
