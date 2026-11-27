"use server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageTranslation } from "../lib/assert-can-manage"
import { updateTranslationSettings } from "../lib/update-settings"
import { updateTranslationSettingsRequest } from "../schema/action"

export const updateTranslationSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(updateTranslationSettingsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    await assertCanManageTranslation({ member: ctx.workspaceMember })
    return await updateTranslationSettings({
      workspaceId,
      request: parsedInput,
    })
  })
