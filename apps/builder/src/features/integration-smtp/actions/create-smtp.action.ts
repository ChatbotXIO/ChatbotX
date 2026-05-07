"use server"

import { workspaceIdrequestParams } from "@/features/common/schemas"
import { identifyWorkspaceAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createSmtpRequest } from "../schemas/mutation"
import { createSmtp } from "../services/smtp.service"

export const createSmtpAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props
    await identifyWorkspaceAndOrganizationFromRequest(workspaceId)

    const inbox = await createSmtp(workspaceId, parsedInput)

    revalidateCacheTags(`workspaces:${workspaceId}#smtps`)

    return {
      id: inbox.id,
    }
  })
