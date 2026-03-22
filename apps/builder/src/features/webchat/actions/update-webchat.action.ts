"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { integrationWebchatModel } from "@aha.chat/database/schema"
import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateWebchatRequest } from "../schemas/webchat.schema"

export const updateWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateWebchatRequest)
  .action(async ({ parsedInput, bindArgsParsedInputs: [chatbotId, id] }) => {
    const { authorizedDomains, welcomeFlowId, ...rest } = parsedInput

    const integration = await findOrFail<IntegrationWebchatModel>(
      integrationWebchatModel,
      {
        id,
        chatbotId,
      },
      "Webchat integration not found",
    )

    await db.transaction(async (tx) => {
      await tx
        .update(integrationWebchatModel)
        .set({
          ...rest,
          chatbotId,
          welcomeFlowId: welcomeFlowId?.length ? welcomeFlowId : null,
          authorizedDomains: authorizedDomains
            ? authorizedDomains.map((domain) => domain.value)
            : undefined,
        })
        .where(eq(integrationWebchatModel.id, integration.id))
    })

    revalidateCacheTags(`chatbots:${chatbotId}#webchats`)
  })
