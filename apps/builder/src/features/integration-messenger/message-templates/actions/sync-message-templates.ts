"use server"

import {
  buildContext,
  messengerMessageTemplateService,
} from "@chatbotx.io/business"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
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

  // A full sync mirrors the page exactly; a partial sync (by id/name) only
  // upserts what it fetched. Both go through the business service so the
  // clone link written by a reservation survives every resync.
  await db.transaction(async (tx) => {
    if (!isPartialSync) {
      await messengerMessageTemplateService.deleteMissingForIntegration({
        integrationMessengerId: integrationMessenger.id,
        keepSourceIds: templates.map((template) => template.id),
        tx,
      })
    }
    await messengerMessageTemplateService.upsertFromMeta({
      integrationMessengerId: integrationMessenger.id,
      templates,
      tx,
    })
  })
}

export const syncMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const integrationMessenger = await findOrFail({
      table: integrationMessengerModel,
      where: {
        workspaceId,
        id,
      },
      message: "Messenger integration not found",
    })

    await syncMessengerMessageTemplatesForIntegration({
      workspaceId,
      integrationMessenger,
    })

    await invalidateCacheByTags([
      `workspaces:${workspaceId}#messenger#messageTemplates`,
    ])
  })
