"use server"

import { integrationSmtpService, workspaceService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { prepareSmtpAuth } from "../lib/prepare-smtp-auth"
import { createSmtpRequest } from "../schema/mutation"

export const createSmtpAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props
    const { fromAddress, username, password, provider } = parsedInput

    const { host, port } = await prepareSmtpAuth(parsedInput)

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw new ChatbotXException("Workspace not found")
    }

    const { inbox } = await integrationSmtpService.connect({
      workspaceId,
      ownerId: workspace.ownerId,
      name: username,
      fromAddress,
      auth: {
        authType: "custom",
        provider,
        host,
        port,
        username,
        password,
      },
    })

    return {
      id: inbox.id,
    }
  })
