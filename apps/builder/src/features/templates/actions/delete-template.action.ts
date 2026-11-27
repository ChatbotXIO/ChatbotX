"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { templateActionClientAllowExpired } from "./template-action-client"

export const deleteTemplateAction = templateActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      ctx: { templateActor },
      bindArgsParsedInputs: [workspaceId, templateId],
    } = props
    await templateService.softDelete({
      workspaceId,
      templateId,
      actor: templateActor,
    })
  })
