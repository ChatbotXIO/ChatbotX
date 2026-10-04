"use server"

import { messengerIntegrationService } from "@chatbotx.io/business"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMessengerMessageTemplate } from "../lib/message-template-operations"
import { createMessengerMessageTemplateRequest } from "../schema/mutation"

function formatTemplateRejectionMessage({
  rejectionReason,
  specificRejectionReason,
}: {
  rejectionReason?: string
  specificRejectionReason?: string
}) {
  const reasons = [rejectionReason, specificRejectionReason].filter(Boolean)
  return reasons.length > 0
    ? `Meta rejected this template: ${reasons.join(" / ")}`
    : "Meta rejected this template"
}

export const createMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .schema(createMessengerMessageTemplateRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, integrationMessengerId],
      parsedInput,
    } = props

    const integrationMessenger =
      await messengerIntegrationService.findByIdForWorkspace({
        id: integrationMessengerId,
        workspaceId,
      })

    if (!integrationMessenger) {
      throw new Error("Messenger integration not found")
    }

    const created = await createMessengerMessageTemplate({
      workspaceId,
      integrationMessenger,
      request: parsedInput,
    })

    if (created.status === "REJECTED") {
      throw new SdkException(
        formatTemplateRejectionMessage({
          rejectionReason: created.rejectionReason,
          specificRejectionReason: created.specificRejectionReason,
        }),
      )
    }

    return { status: created.status }
  })
