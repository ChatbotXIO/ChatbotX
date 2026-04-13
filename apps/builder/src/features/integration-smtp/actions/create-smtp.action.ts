"use server"

import { db } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
import { inboxModel, integrationSmtpModel } from "@chatbotx.io/database/schema"
import { smtpHostMap } from "@chatbotx.io/integration-smtp"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { identifyChatbotAndOrganizationFromRequest } from "@/features/integrations/uitls"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createSmtpRequest } from "../schemas/mutation"

export const createSmtpAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSmtpRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props
    await identifyChatbotAndOrganizationFromRequest(workspaceId)

    let { host, port, ...rest } = parsedInput
    if (parsedInput.provider !== "other") {
      const defaultHostAndPort = smtpHostMap[parsedInput.provider]
      host = defaultHostAndPort.host
      port = defaultHostAndPort.port
    }

    const inbox = await db.transaction(async (tx) => {
      const smtpId = createId()
      const name = parsedInput.username
      const inbox = await tx
        .insert(inboxModel)
        .values({
          id: smtpId,
          workspaceId,
          channel: channelTypes.enum.smtp,
          name,
          sourceId: smtpId,
        })
        .returning()
        .then((result) => result[0])

      await tx.insert(integrationSmtpModel).values({
        id: smtpId,
        name,
        workspaceId,
        inboxId: inbox.id,
        auth: {
          ...rest,
          host,
          port,
        },
      })

      return inbox
    })

    revalidateCacheTags(`workspaces:${workspaceId}#smtps`)

    return {
      id: inbox.id,
    }
  })
