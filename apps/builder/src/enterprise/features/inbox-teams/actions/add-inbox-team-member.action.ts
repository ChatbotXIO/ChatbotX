"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import { inboxTeamMemberModel, inboxTeamModel } from "@aha.chat/database/schema"
import type { InboxTeamModel } from "@aha.chat/database/types"
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
} from "../schema"

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
        const inboxTeam = await findOrFail<InboxTeamModel>(
          inboxTeamModel,
          {
            id,
            chatbotId,
          },
          "Inbox team not found",
        )

        const existingMembers = await tx.query.inboxTeamMemberModel.findMany({
          where: {
            userId: {
              in: parsedInput.userIds,
            },
            inboxTeamId: inboxTeam.id,
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
