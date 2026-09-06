"use server"

import { integrationSmtpService } from "@chatbotx.io/business"
import { auditService, isSameJsonValue } from "@chatbotx.io/business/audit"
import type { SmtpAuthValue } from "@chatbotx.io/integration-smtp"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { resolveSmtpHostAndPort } from "../lib/smtp-host"
import { verifySmtpConnection } from "../lib/verify-connection"
import { updateSmtpRequest } from "../schema/mutation"

export const updateSmtpAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await verifySmtpConnection(parsedInput)

    const integration = await integrationSmtpService.findByIdForWorkspace({
      id,
      workspaceId,
    })

    const currentAuth = integration.auth as SmtpAuthValue
    const provider = parsedInput.provider ?? currentAuth.provider

    const { host, port } = resolveSmtpHostAndPort(provider, {
      host: parsedInput.host || currentAuth.host,
      port: parsedInput.port || currentAuth.port,
    })

    const updatedAuth: SmtpAuthValue = {
      authType: "custom",
      provider,
      host,
      port,
      username: parsedInput.username ?? currentAuth.username,
      password: parsedInput.password ?? currentAuth.password,
    }

    const name = parsedInput.username ?? integration.name

    const updated = await integrationSmtpService.update({
      workspaceId,
      id: integration.id,
      auth: updatedAuth,
      name,
      fromAddress: parsedInput.fromAddress,
    })

    const hasChanged = !isSameJsonValue(
      { auth: updatedAuth, name, fromAddress: parsedInput.fromAddress },
      {
        auth: currentAuth,
        name: integration.name,
        fromAddress: integration.fromAddress,
      },
    )

    if (hasChanged) {
      await auditService.record({
        workspaceId,
        action: "update",
        detail: "updated the SMTP channel configuration",
      })
    }

    return updated
  })
