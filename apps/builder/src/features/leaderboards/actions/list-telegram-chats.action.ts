"use server"

import { listTelegramLeaderboardChats } from "@chatbotx.io/business/leaderboard"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { listTelegramChatsRequest } from "../lib/action-schemas"

/** Groups/channels where the inbox's bot is an admin (Telegram scope picker). */
export const listTelegramChatsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(listTelegramChatsRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await listTelegramLeaderboardChats({
        workspaceId,
        inboxId: parsedInput.inboxId,
      }),
  )
