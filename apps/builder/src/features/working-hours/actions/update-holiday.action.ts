"use server"

import { workingHoursService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toHolidayResource } from "../lib/to-resource"
import { updateHolidayRequest } from "../schema/action"

export const updateHolidayAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateHolidayRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    return toHolidayResource(
      await workingHoursService.updateHoliday({
        workspaceId,
        id,
        data: parsedInput,
      }),
    )
  })
