"use server"

import { conversationService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

const findParticipantConversationRequest = z.object({
  contactId: z.string().min(1),
})

/**
 * The participant's DM conversation, for the "open in inbox" click on the
 * participants table (same behaviour as the minigame play history). Scoped
 * to the workspace, so a foreign contact id simply returns null.
 */
export const findParticipantConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(findParticipantConversationRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const conversation = await conversationService.findDMByContact({
      workspaceId,
      contactId: parsedInput.contactId,
    })
    return { conversationId: conversation?.id ?? null }
  })
