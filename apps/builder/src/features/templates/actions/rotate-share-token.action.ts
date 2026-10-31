"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { templateActionClient } from "./template-action-client"

/** Issues a new share link; every link shared before stops working. */
export const rotateShareTokenAction = templateActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ ctx: { templateActor }, bindArgsParsedInputs }) => {
    const [workspaceId, templateId] = bindArgsParsedInputs
    const template = await templateService.rotateShareToken({
      workspaceId,
      templateId,
      actor: templateActor,
    })
    return { shareToken: template.shareToken }
  })
