"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import { searchMessagesInConversation } from "../queries"

// Server action chamada pela lupa do header da conversa (Sprint Inbox 1.2).
// Busca por keyword dentro de UMA conversa específica (não global).
// Pedro 2026-05-24: "100% igual Respond.io" — lupa do header é busca local.
export const searchMessagesInConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString()])
  .inputSchema(
    z.object({
      conversationId: zodBigintAsString(),
      keyword: z.string().min(1).max(200),
    }),
  )
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    const results = await searchMessagesInConversation({
      workspaceId,
      conversationId: parsedInput.conversationId,
      keyword: parsedInput.keyword,
    })

    return { results }
  })
