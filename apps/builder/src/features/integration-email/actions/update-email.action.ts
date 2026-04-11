"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationEmailModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateEmailRequest } from "../schema/mutation"

export const updateEmailAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateEmailRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
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
      .update(integrationEmailModel)
      .set({
        ...parsedInput,
        workspaceId,
      })
      .where(eq(integrationEmailModel.id, integration.id))

    revalidateCacheTags(`workspaces:${workspaceId}#emails`)
  })
