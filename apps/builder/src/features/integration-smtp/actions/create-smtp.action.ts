"use server"

import { integrationSmtpService, workspaceService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { resolveSmtpHostAndPort } from "../lib/smtp-host"
import { verifySmtpConnection } from "../lib/verify-connection"
import { createSmtpRequest } from "../schema/mutation"

export const createSmtpAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props
    const { fromAddress, username, password, provider, ...rest } = parsedInput

    await verifySmtpConnection(parsedInput)

    const { host, port } = resolveSmtpHostAndPort(provider, {
      host: rest.host,
      port: rest.port,
    })

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (!workspace) {
      throw new ChatbotXException("Workspace not found")
    }

    const { inbox, wasCreated } = await integrationSmtpService.connect({
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

    if (wasCreated) {
      await auditService.record({
        workspaceId,
        action: "connect",
        detail: `connected a new SMTP channel (#${inbox.id})`,
      })
    }

    return {
      id: inbox.id,
    }
  })
