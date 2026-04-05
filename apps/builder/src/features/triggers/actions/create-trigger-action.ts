"use server"

import { updateTriggerCache } from "@chatbotx/events"
import { db, eq } from "@chatbotx.io/database/client"
import { folderTypes } from "@chatbotx.io/database/partials"
import { triggerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { ChatbotXException } from "@/lib/errors/exception"
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
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateTriggerSchema
    }) => {
      const t = await getTranslations()

      const existingTriggersCount = await db.$count(
        triggerModel,
        eq(triggerModel.workspaceId, workspaceId),
      )

      if (existingTriggersCount >= MAX_TRIGGERS_PER_CHATBOT) {
        throw new ChatbotXException(
          t("validation.maxItemsReached", {
            max: MAX_TRIGGERS_PER_CHATBOT,
            feature: "triggers",
          }),
        )
      }

      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          workspaceId,
          folderTypes.enum.trigger,
        )
      }

      const { ...triggerData } = parsedInput

      const result = await db
        .insert(triggerModel)
        .values({
          id: createId(),
          ...triggerData,
          workspaceId,
        })
        .returning()
        .then((rows) => rows[0])

      await updateTriggerCache(workspaceId)

      return result
    },
  )
