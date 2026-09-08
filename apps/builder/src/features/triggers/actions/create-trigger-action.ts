"use server"

import { triggerService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { folderTypes } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateTriggerSchema,
  createTriggerSchema,
} from "../schema/mutation"

export const createTriggerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createTriggerSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateTriggerSchema
    }) => {
      try {
        return await triggerService.create({
          workspaceId,
          data: parsedInput,
          folderType: folderTypes.enum.trigger,
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
