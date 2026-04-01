"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { chatbotIdAndIdRequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const deleteWebchatAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [chatbotId, id] }) => {
    const integration = await findOrFail(
      integrationWebchatModel,
      {
        id,
        chatbotId,
      },
      "Webchat integration not found",
    )

    await db
      .delete(integrationWebchatModel)
      .where(eq(integrationWebchatModel.id, integration.id))

    revalidateCacheTags(`chatbots:${chatbotId}#webchats`)
  })
