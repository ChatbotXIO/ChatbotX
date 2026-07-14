"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const regenerateWebchatIdentitySecretAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    await findOrFail({
      table: integrationWebchatModel,
      where: { id, workspaceId },
      message: "Webchat integration not found",
    })

    const identitySecret =
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "")

    await db
      .update(integrationWebchatModel)
      .set({ identitySecret })
      .where(eq(integrationWebchatModel.id, id))

    return { identitySecret }
  })
