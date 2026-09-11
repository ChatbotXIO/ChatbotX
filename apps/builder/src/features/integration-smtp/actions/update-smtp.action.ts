"use server"

import { integrationSmtpService } from "@chatbotx.io/business"
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

    // Host/port resolution needs `smtpHostMap` from `@chatbotx.io/integration-smtp`,
    // which `packages/business` must not depend on — so it stays here and the
    // service receives the already-resolved pair. Merging against the stored
    // auth, the change diff and the audit record all live in the service.
    const { host, port } = resolveSmtpHostAndPort(parsedInput.provider, {
      host: parsedInput.host,
      port: parsedInput.port,
    })

    return await integrationSmtpService.update({
      workspaceId,
      id,
      data: { ...parsedInput, host, port },
    })
  })
