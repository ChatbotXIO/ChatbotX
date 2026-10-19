"use server"

import { workingHoursService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toHolidayResource } from "../lib/to-resource"
import { createHolidayRequest } from "../schema/action"

/** Adds a workspace-wide holiday (same service as the public API). */
export const createHolidayAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createHolidayRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    return toHolidayResource(
      await workingHoursService.addHoliday({ workspaceId, data: parsedInput }),
    )
  })
