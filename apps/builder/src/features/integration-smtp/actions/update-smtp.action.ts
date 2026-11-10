"use server"

import { integrationSmtpService, userService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { prepareSmtpAuth } from "../lib/prepare-smtp-auth"
import { updateSmtpRequest } from "../schema/mutation"

export const updateSmtpAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
      ctx,
    } = props

    // Merging against the stored auth, the change diff, and the audit record
    // all live in the service.
    const { host, port, auth, imap, imapUsername, imapPassword } =
      await prepareSmtpAuth(parsedInput)

    await userService.recordConnectionAuthorization({
      userId: ctx.user.id,
      provider: "smtp",
      auth,
      phase: "credentialsValidated",
      workspaceId,
    })
    const { imap: _imapRequest, ...smtpFields } = parsedInput

    return await integrationSmtpService.update({
      workspaceId,
      id,
      data: { ...smtpFields, host, port, imap, imapUsername, imapPassword },
    })
  })
