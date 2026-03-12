"use server"

import { db, eq } from "@aha.chat/database/client"
import { FolderType } from "@aha.chat/database/enums"
import { webhookModel } from "@aha.chat/database/schema"
import { updateWebhookCache } from "@aha.chat/events"
import { createId } from "@paralleldrive/cuid2"
import { getTranslations } from "next-intl/server"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { chatbotActionClient } from "@/lib/safe-action"
import { MAX_WEBHOOKS_PER_CHATBOT } from "../constants"
import {
  type CreateWebhookSchema,
  createWebhookSchema,
} from "../schemas/create-webhook-schema"
import { MaxWebhooksReachedException } from "../schemas/exception"

export const createWebhookAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createWebhookSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateWebhookSchema
    }) => {
      const t = await getTranslations()

      const existingWebhooksCount = await db.$count(
        webhookModel,
        eq(webhookModel.chatbotId, chatbotId),
      )

      if (existingWebhooksCount >= MAX_WEBHOOKS_PER_CHATBOT) {
        throw new MaxWebhooksReachedException(
          t("validation.maxItemsReached", {
            max: MAX_WEBHOOKS_PER_CHATBOT,
            feature: "webhooks",
          }),
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.webhook,
        )
      }

      const { ...webhookData } = parsedInput

      const result = await db
        .insert(webhookModel)
        .values({
          id: createId(),
          ...webhookData,
          chatbotId,
          url: "",
        })
        .returning()
        .then((rows) => rows[0])

      await updateWebhookCache(chatbotId)

      return result
    },
  )
