"use server"

import {
  buildContext,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { workspaceActionClient } from "@/lib/safe-action"

export async function syncMessengerMessageTemplatesForIntegration({
  workspaceId,
  integrationMessenger,
  templateId,
  templateName,
  templateLanguage,
}: {
  workspaceId: string
  integrationMessenger: IntegrationMessengerModel
  templateId?: string
  templateName?: string
  templateLanguage?: string
}) {
  const isPartialSync = Boolean(templateId || templateName || templateLanguage)
  const ctx = await buildContext({
    workspaceId,
    integrationType: "messenger",
    integration: {
      ...integrationMessenger,
      auth: integrationMessenger.auth as MessengerAuthValue,
    },
  })
  let res: Awaited<
    ReturnType<typeof integrations.messenger.runAction<"listMessageTemplates">>
  >
  try {
    res = await integrations.messenger.runAction("listMessageTemplates", {
      ctx,
      input: templateName ? { name: templateName } : undefined,
    })
  } catch (error) {
    throw new SdkException(
      `Failed to fetch Messenger templates from Facebook API: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const templates = res.data.filter((template) => {
    if (templateId && template.id !== templateId) {
      return false
    }

    if (templateName && template.name !== templateName) {
      return false
    }

    if (templateLanguage && template.language !== templateLanguage) {
      return false
    }

    return true
  })

  await messengerIntegrationService.syncMessageTemplates({
    integrationMessengerId: integrationMessenger.id,
    templates,
    isPartialSync,
  })
}

export const syncMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const integrationMessenger =
      await messengerIntegrationService.findByIdForWorkspace({
        workspaceId,
        id,
      })

    if (!integrationMessenger) {
      throw new Error("Messenger integration not found")
    }

    await syncMessengerMessageTemplatesForIntegration({
      workspaceId,
      integrationMessenger,
    })

    await invalidateCacheByTags([
      `workspaces:${workspaceId}#messenger#messageTemplates`,
    ])
  })
