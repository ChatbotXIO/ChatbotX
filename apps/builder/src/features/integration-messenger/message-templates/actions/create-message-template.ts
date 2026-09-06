"use server"

import { messengerIntegrationService } from "@chatbotx.io/business"
import { createPageMessageTemplate } from "@chatbotx.io/integration-messenger/apis/message-templates"
import { resumableUploadImage } from "@chatbotx.io/integration-messenger/apis/upload"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { buildMessengerMessageTemplateComponents } from "../lib/build-template-components"
import { createMessengerMessageTemplateRequest } from "../schema/mutation"
import { syncMessengerMessageTemplatesForIntegration } from "./sync-message-templates"

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

    const auth = integrationMessenger.auth as MessengerAuthValue
    const headerHandle =
      parsedInput.headerType === "text_and_image" && parsedInput.headerImageUrl
        ? await resumableUploadImage(auth, parsedInput.headerImageUrl, {
            authenticatedDownload: false,
          })
        : undefined

    const components = buildMessengerMessageTemplateComponents(
      parsedInput,
      headerHandle,
    )

    const resp = await createPageMessageTemplate(auth, {
      name: parsedInput.name,
      language: parsedInput.language,
      category: "UTILITY",
      components,
    })

    await syncMessengerMessageTemplatesForIntegration({
      workspaceId,
      integrationMessenger,
      templateId: resp.id,
      templateName: parsedInput.name,
      templateLanguage: parsedInput.language,
    })

    await invalidateCacheByTags([
      `workspaces:${workspaceId}#messenger#messageTemplates`,
    ])

    if (resp.status === "REJECTED") {
      throw new SdkException(
        formatTemplateRejectionMessage({
          rejectionReason: resp.rejection_reason,
          specificRejectionReason: resp.specific_rejection_reason,
        }),
      )
    }

    return { status: resp.status }
  })
