"use server"

import { db } from "@aha.chat/database/client"
import { inboxTeamMemberModel, inboxTeamModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { type CreateInboxTeamRequest, createInboxTeamRequest } from "../schema"

export const createInboxTeamAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createInboxTeamRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      parsedInput: CreateInboxTeamRequest
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      await db.transaction(async (tx) => {
        const inboxTeamId = createId()
        await tx.insert(inboxTeamModel).values({
          id: inboxTeamId,
          name: parsedInput.name,
          chatbotId,
        })

        if (parsedInput.userIds.length > 0) {
          await tx.insert(inboxTeamMemberModel).values(
            parsedInput.userIds.map((userId) => ({
              id: createId(),
              userId,
              chatbotId,
              inboxTeamId,
            })),
          )
        }
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
