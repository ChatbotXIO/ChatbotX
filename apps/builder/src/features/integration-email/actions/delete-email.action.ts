"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationEmailModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteEmailAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props
    const integration = await findOrFail({
      table: integrationEmailModel,
      where: {
        id,
        workspaceId,
      },
      message: "Email integration not found",
    })

    await db
      .delete(integrationEmailModel)
      .where(eq(integrationEmailModel.id, integration.id))

    revalidateCacheTags(`workspaces:${workspaceId}#emails`)
  })
