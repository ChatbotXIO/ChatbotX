"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateSmtpRequest } from "../schemas/mutation"

export const updateSmtpAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    const integration = await findOrFail({
      table: integrationSmtpModel,
      where: {
        id,
        workspaceId,
      },
      message: "SMTP integration not found",
    })

    await db
      .update(integrationSmtpModel)
      .set({
        ...parsedInput,
        workspaceId,
      })
      .where(eq(integrationSmtpModel.id, integration.id))

    revalidateCacheTags(`workspaces:${workspaceId}#smtps`)
  })
