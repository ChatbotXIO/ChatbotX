"use server"

import { FolderType, prisma } from "@aha.chat/database"
import { getTranslations } from "next-intl/server"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIdIsExists } from "@/features/folders/actions/utils"
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

      const existingWebhooksCount = await prisma.webhook.count({
        where: { chatbotId },
      })

      if (existingWebhooksCount >= MAX_WEBHOOKS_PER_CHATBOT) {
        throw new MaxWebhooksReachedException(
          t("validation.maxItemsReached", {
            max: MAX_WEBHOOKS_PER_CHATBOT,
            feature: "webhooks",
          }),
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIdIsExists(
          parsedInput.folderId,
          chatbotId,
          FolderType.webhook,
        )
      }

      const { ...webhookData } = parsedInput

      const result = await prisma.webhook.create({
        data: {
          ...webhookData,
          chatbotId,
          url: "",
        },
      })

      return result
    },
  )
