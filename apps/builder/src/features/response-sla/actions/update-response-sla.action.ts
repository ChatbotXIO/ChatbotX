"use server"

import { responseSlaService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toResponseSlaResource } from "../lib/to-resource"
import { updateResponseSlaRequest } from "../schema/action"

/** Sets the workspace response SLA policy (same service as the public API). */
export const updateResponseSlaAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateResponseSlaRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    return toResponseSlaResource(
      await responseSlaService.upsertPolicy({
        workspaceId,
        data: parsedInput,
      }),
    )
  })
