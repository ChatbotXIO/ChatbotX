"use server"

import {
  integrationSmtpService,
  userService,
  workspaceService,
} from "@chatbotx.io/business"
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
      ctx,
    } = props
    const { fromAddress, username } = parsedInput

    const { auth } = await prepareSmtpAuth(parsedInput)

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw new ChatbotXException("Workspace not found")
    }

    await userService.recordConnectionAuthorization({
      userId: ctx.user.id,
      provider: "smtp",
      auth,
      phase: "credentialsValidated",
      workspaceId,
    })

    const { inbox } = await integrationSmtpService.connect({
      workspaceId,
      ownerId: workspace.ownerId,
      name: username,
      fromAddress,
      auth,
    })

    return {
      id: inbox.id,
    }
  })
