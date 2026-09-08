"use server"

import { webhookService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { folderTypes } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateWebhookSchema,
  createWebhookSchema,
} from "../schema/create-webhook-schema"

export const createWebhookAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createWebhookSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateWebhookSchema
    }) => {
      try {
        return await webhookService.create({
          workspaceId,
          data: parsedInput,
          folderType: folderTypes.enum.webhook,
        })
      } catch (error) {
        if (
          error instanceof ChatbotXException &&
          error.code === "validation" &&
          error.data
        ) {
          const t = await getTranslations()
          throw new ChatbotXException(t(error.message, error.data))
        }
        throw error
      }
    },
  )
