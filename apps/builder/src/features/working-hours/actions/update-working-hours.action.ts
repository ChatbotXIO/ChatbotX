"use server"

import { workingHoursService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toWorkingHoursResource } from "../lib/to-resource"
import { updateWorkingHoursRequest } from "../schema/action"

/** Renames and/or replaces the weekly intervals and date overrides (same service as the public API). */
export const updateWorkingHoursAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateWorkingHoursRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId, workingHoursId],
    } = props

    return toWorkingHoursResource(
      await workingHoursService.update({
        workspaceId,
        workingHoursId,
        data: parsedInput,
      }),
    )
  })
