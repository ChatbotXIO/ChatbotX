"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteSmtpAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
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
      .delete(integrationSmtpModel)
      .where(eq(integrationSmtpModel.id, integration.id))

    revalidateCacheTags(`workspaces:${workspaceId}#smtps`)
  })
