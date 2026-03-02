"use server"

import { db } from "@aha.chat/database/client"
import { inboxTeamMemberModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddInboxTeamMemberRequest,
  addInboxTeamMemberRequest,
} from "../schemas/add-inbox-team-member.request"

export const addInboxTeamMemberAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(addInboxTeamMemberRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: AddInboxTeamMemberRequest
    }) => {
      await db.transaction(async (tx) => {
        const existingMembers = await tx.query.inboxTeamMemberModel.findMany({
          where: {
            userId: {
              in: parsedInput.userIds,
            },
            chatbotId,
            inboxTeamId: id,
          },
          columns: {
            userId: true,
          },
        })

        const existingUserIds = new Set(
          existingMembers.map((member) => member.userId),
        )

        const newUserIds = parsedInput.userIds.filter(
          (userId) => !existingUserIds.has(userId),
        )

        if (newUserIds.length > 0) {
          await tx.insert(inboxTeamMemberModel).values(
            newUserIds.map((userId) => ({
              id: createId(),
              userId,
              chatbotId,
              inboxTeamId: id,
            })),
          )
        }
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxTeams`)
    },
  )
