import { conversationService } from "@chatbotx.io/business"
import baseLogger from "@chatbotx.io/logger"
import {
  succeeded,
  type TriggerActionHandler,
  type TriggerActionHandlerInput,
} from "./types"

const triggerContext = (handler: string) =>
  ({
    triggerSource: "worker",
    triggerHandler: `actionExecutor.${handler}`,
    triggerType: "trigger_action",
  }) as const

/**
 * Wraps a handler that mutates the conversation: the scope's memoized row is
 * dropped afterwards so a following action re-reads the new state.
 */
const mutatesConversation =
  (
    run: (input: TriggerActionHandlerInput) => Promise<unknown>,
  ): TriggerActionHandler =>
  async (input) => {
    try {
      await run(input)
    } finally {
      // Also on failure: the service may have written before it threw.
      input.scope.invalidateConversation()
    }
    return succeeded
  }

export const archiveConversation = mutatesConversation(
  ({ context, conversation }) =>
    conversationService.updateArchived({
      workspaceId: context.workspaceId,
      conversations: [conversation],
      archivedAt: new Date(),
      triggerContext: triggerContext("archiveConversation"),
    }),
)

export const unarchiveConversation = mutatesConversation(
  ({ context, conversation }) =>
    conversationService.updateArchived({
      workspaceId: context.workspaceId,
      conversations: [conversation],
      archivedAt: null,
      triggerContext: triggerContext("unarchiveConversation"),
    }),
)

export const assignConversation = mutatesConversation(
  ({ context, conversation }) =>
    conversationService.assignOneOrSkip({
      workspaceId: conversation.workspaceId,
      conversation,
      assignedId: context.action.assignedId as string,
      triggerContext: triggerContext("assignConversation"),
    }),
)

export const unassignConversation = mutatesConversation(({ conversation }) =>
  conversationService.updateAssignment({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    assignedUserId: null,
    assignedInboxTeamId: null,
    triggerContext: triggerContext("unassignConversation"),
  }),
)

export const disableBot = mutatesConversation(({ context, conversation }) =>
  conversationService.disableBotState({
    workspaceId: context.workspaceId,
    conversations: [conversation],
    triggerContext: triggerContext("disableBot"),
  }),
)

export const enableBot = mutatesConversation(({ context, conversation }) =>
  conversationService.enableBotState({
    workspaceId: context.workspaceId,
    conversations: [conversation],
    triggerContext: triggerContext("enableBot"),
  }),
)

export const transferConversationToHuman = mutatesConversation(
  async ({ context, conversation }) => {
    await conversationService.disableBotState({
      workspaceId: context.workspaceId,
      conversations: [conversation],
      triggerContext: triggerContext("transferConversationToHuman"),
    })
    if (context.action.notifyAdmins) {
      baseLogger.info(`Notifying admins for conversation ${conversation.id}`)
    }
  },
)
