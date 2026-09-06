"use server"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { refreshContactProfile } from "../lib/refresh-contact-profile"
import { requireContactPermissionScope } from "../permissions"
import { refreshContactProfileRequest } from "../schema/action"
export const refreshContactProfileAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(refreshContactProfileRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, contactId], parsedInput }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await refreshContactProfile({
        workspaceId,
        contactId,
        ...parsedInput,
        accessScope,
      })
    },
  )
