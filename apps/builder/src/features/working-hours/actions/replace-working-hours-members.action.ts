"use server"

import { workingHoursService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toWorkingHoursResource } from "../lib/to-resource"
import { setWorkingHoursMembersRequest } from "../schema/action"

/** Full replacement; a member already on another schedule is moved here. */
export const replaceWorkingHoursMembersAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(setWorkingHoursMembersRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId, workingHoursId],
    } = props

    return toWorkingHoursResource(
      await workingHoursService.replaceMembers({
        workspaceId,
        workingHoursId,
        userIds: parsedInput.userIds,
      }),
    )
  })
