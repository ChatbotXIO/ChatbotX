"use server"

import { triggerService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { MAX_TRIGGERS_PER_CHATBOT } from "../constants"
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
      const t = await getTranslations()

      const existingTriggersCount =
        await triggerService.countByWorkspaceId(workspaceId)

      if (existingTriggersCount >= MAX_TRIGGERS_PER_CHATBOT) {
        throw new ChatbotXException(
          t("validation.maxItemsReached", {
            max: MAX_TRIGGERS_PER_CHATBOT,
            feature: "triggers",
          }),
        )
      }

      return await triggerService.create({
        ...parsedInput,
        workspaceId,
      })
    },
  )
