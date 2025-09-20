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
    const { authorizedDomains, ...rest } = parsedInput

    const integration = await prisma.integrationWebchat.findFirstOrThrow({
      where: {
        id,
        chatbotId,
      },
    })

    await prisma.$transaction(async (tx) => {
      await tx.integrationWebchat.update({
        where: {
          id: integration.id,
        },
        data: {
          ...rest,
          authorizedDomains: authorizedDomains
            ? authorizedDomains.map((domain) => domain.value)
            : undefined,
        },
      })
    })

    revalidateTag(`chatbots:${chatbotId}#webchats`)
  })
