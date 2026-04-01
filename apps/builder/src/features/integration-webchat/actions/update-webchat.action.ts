"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { updateWebchatRequest } from "../schema/mutation"

export const updateWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateWebchatRequest)
  .action(async ({ parsedInput, bindArgsParsedInputs: [chatbotId, id] }) => {
    const { authorizedDomains, welcomeFlowId, ...rest } = parsedInput

    const integration = await findOrFail(
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
