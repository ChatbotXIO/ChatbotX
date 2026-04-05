"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteWebchatAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props
    const integration = await findOrFail({
      table: integrationWebchatModel,
      where: {
        id,
        workspaceId,
      },
      message: "Webchat integration not found",
    })

    await db
      .delete(integrationWebchatModel)
      .where(eq(integrationWebchatModel.id, integration.id))

    revalidateCacheTags(`workspaces:${workspaceId}#webchats`)
  })
