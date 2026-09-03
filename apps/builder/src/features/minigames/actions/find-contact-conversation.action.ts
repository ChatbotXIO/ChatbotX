"use server"

import { conversationService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { findContactConversationRequest } from "../schema/action"

export const findContactConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(findContactConversationRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const { contactId, contactInboxId } = parsedInput
    if (!contactInboxId) {
      // Plays recorded before the `contactInboxId` column existed have no
      // reliable way to identify which conversation they came from — return
      // "not found" instead of guessing by channel.
      return { conversationId: null }
    }

    const conversation = await conversationService.findDMByContactInbox({
      workspaceId,
      contactId,
      contactInboxId,
    })
    return { conversationId: conversation?.id ?? null }
  })
