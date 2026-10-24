"use server"

import { ecommerceOpenHoursService } from "@chatbotx.io/business"
import { openHoursScheduleSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schema"
import {
  workspaceActionClient,
  workspaceActionClientAllowExpired,
} from "@/lib/safe-action"

export const createOpenHoursAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(openHoursScheduleSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await ecommerceOpenHoursService.create({ workspaceId, ...parsedInput }),
  )

export const updateOpenHoursAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(openHoursScheduleSchema)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, openHoursId], parsedInput }) =>
      await ecommerceOpenHoursService.update({
        workspaceId,
        openHoursId,
        data: parsedInput,
      }),
  )

export const deleteOpenHoursAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, openHoursId] }) => {
    await ecommerceOpenHoursService.delete({ workspaceId, openHoursId })
  })
