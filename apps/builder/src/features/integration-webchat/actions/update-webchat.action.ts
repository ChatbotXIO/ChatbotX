"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWebchatRequest } from "../schema/mutation"

export const updateWebchatAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWebchatRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const { authorizedDomains, welcomeFlowId, ...rest } = parsedInput

    const integration = await findOrFail({
      table: integrationWebchatModel,
      where: {
        id,
        workspaceId,
      },
      message: "Webchat integration not found",
    })

    await db.transaction(async (tx) => {
      await tx
        .update(integrationWebchatModel)
        .set({
          ...rest,
          workspaceId,
          welcomeFlowId: welcomeFlowId?.length ? welcomeFlowId : null,
          authorizedDomains: authorizedDomains
            ? authorizedDomains.map((domain) => domain.value)
            : undefined,
        })
        .where(eq(integrationWebchatModel.id, integration.id))
    })

    revalidateCacheTags(`workspaces:${workspaceId}#webchats`)
  })
