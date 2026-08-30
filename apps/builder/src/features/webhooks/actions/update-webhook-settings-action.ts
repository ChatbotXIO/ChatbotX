"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { db, eq } from "@chatbotx.io/database/client"
import { webhookModel } from "@chatbotx.io/database/schema"
import { updateWebhookCache } from "@chatbotx.io/events"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateWebhookSettingsRequest,
  updateWebhookSettingsRequest,
} from "../schema/update-webhook-schema"

export const updateWebhookSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWebhookSettingsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    const webhook = await db.query.webhookModel.findFirst({
      where: {
        id,
        workspaceId,
      },
    })

    if (!webhook) {
      throw new Error("Webhook not found")
    }

    const changedEntries = Object.entries(parsedInput).filter(
      ([key, value]) =>
        webhook[key as keyof UpdateWebhookSettingsRequest] !== value,
    )

    if (changedEntries.length === 0) {
      return
    }

    const updated = await db
      .update(webhookModel)
      .set(parsedInput)
      .where(eq(webhookModel.id, webhook.id))
      .returning({ id: webhookModel.id })

    if (updated.length === 0) {
      return
    }

    await updateWebhookCache(workspaceId)

    const changedKeys = changedEntries.map(([key]) => key)
    let detail = `updated a webhook (#${webhook.id})`
    if (changedKeys.length === 1 && changedKeys[0] === "active") {
      detail = parsedInput.active
        ? `enabled a webhook (#${webhook.id})`
        : `disabled a webhook (#${webhook.id})`
    }

    await auditService.record({
      workspaceId,
      action: "update",
      detail,
    })
  })
