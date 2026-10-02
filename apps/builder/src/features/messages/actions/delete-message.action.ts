"use server"

import {
  contactInboxService,
  conversationService,
  messageService,
  queueWorkspaceRealtimeEvent,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { RealtimeEventType } from "@chatbotx.io/realtime-protocol"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type DeleteMessageRequest,
  deleteMessageRequest,
} from "../schema/mutation"

export const deleteMessage = async (props: {
  workspaceId: string
  conversationId: string
  parsedInput: DeleteMessageRequest
}) => {
  const { workspaceId, conversationId, parsedInput } = props
  const { id, createdAt } = parsedInput

  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId },
  })

  // Resolve the comment's own contactInbox so the worker dispatches to the
  // exact channel the comment belongs to (the commenter's messenger inbox).
  const message = await messageService.findWithAttachments({
    id,
    createdAt: new Date(createdAt),
    workspaceId,
  })
  if (!message || message.conversationId !== conversationId) {
    throw new ChatbotXException("Comment not found")
  }

  // Soft-delete immediately in the DB and notify other tabs in realtime.
  // If the message has a sourceId, also queue a background job to remove it
  // from the external channel (e.g. Facebook).
  const deleted = await messageService.delete({
    id: message.id,
    sourceId: message.sourceId ?? undefined,
    workspaceId,
    createdAt: message.createdAt,
  })
  const messageIds = deleted.map((row) => row.id)

  queueWorkspaceRealtimeEvent(workspaceId, {
    eventType: RealtimeEventType.messageDeleted,
    data: { messageIds },
  })

  const jobs: Promise<unknown>[] = []

  if (message.sourceId && message.contactInboxId) {
    const contactInbox = await contactInboxService.findBy({
      where: { id: message.contactInboxId },
    })
    if (contactInbox) {
      jobs.push(
        chatQueue.add(ChatJobAction.deleteChannelMessage, {
          type: ChatJobAction.deleteChannelMessage,
          data: {
            conversation,
            contactInbox,
            message: { id: message.id, createdAt: message.createdAt },
          },
        }),
      )
    }
  }

  await Promise.allSettled(jobs)

  return { success: true, messageIds }
}

export const deleteMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(deleteMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    return await deleteMessage({ workspaceId, conversationId, parsedInput })
  })
