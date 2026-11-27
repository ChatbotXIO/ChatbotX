"use server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageTranslation } from "../lib/assert-can-manage"
import { testTranslationSettings } from "../lib/test-settings"
import { testTranslationSettingsRequest } from "../schema/action"

export const testTranslationSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(testTranslationSettingsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    await assertCanManageTranslation({ member: ctx.workspaceMember })
    return await testTranslationSettings({
      workspaceId,
      request: parsedInput,
    })
  })
