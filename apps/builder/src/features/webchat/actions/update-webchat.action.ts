"use server"

import { prisma } from "@aha.chat/database"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateWebchatRequest } from "../schemas/webchat.schema"

export const updateWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateWebchatRequest)
  .action(async ({ parsedInput, bindArgsParsedInputs: [chatbotId, id] }) => {
    const { authorizedDomains, welcomeFlowId, ...rest } = parsedInput

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
          welcomeFlowId: welcomeFlowId?.length ? welcomeFlowId : null,
          authorizedDomains: authorizedDomains
            ? authorizedDomains.map((domain) => domain.value)
            : undefined,
        },
      })
    })

    revalidateCacheTags(`chatbots:${chatbotId}#webchats`)
  })
