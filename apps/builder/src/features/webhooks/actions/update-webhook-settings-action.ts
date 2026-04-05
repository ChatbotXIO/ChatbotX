"use server"

import { updateWebhookCache } from "@chatbotx/events"
import { db, eq } from "@chatbotx.io/database/client"
import { webhookModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWebhookSettingsRequest } from "../schemas/update-webhook-schema"

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

    await db
      .update(webhookModel)
      .set(parsedInput)
      .where(eq(webhookModel.id, webhook.id))

    await updateWebhookCache(workspaceId)
  })
