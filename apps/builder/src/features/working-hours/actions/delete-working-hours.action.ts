"use server"

import { workingHoursService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/** No input schema: both ids are bound args, so callers use `execute()`. */
export const deleteWorkingHoursAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, workingHoursId],
    } = props

    await workingHoursService.delete({ workspaceId, workingHoursId })
  })
