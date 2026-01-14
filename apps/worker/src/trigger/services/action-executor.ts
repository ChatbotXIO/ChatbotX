import { prisma } from "@aha.chat/database"
import { TriggerAction } from "@aha.chat/database/enums"
import baseLogger from "@aha.chat/logger"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import {
  addContactTag,
  clearContactCustomField,
  removeContactTag,
  setContactCustomField,
} from "../../integration/handlers/contact-handler"
import {
  archiveConversation,
  assignConversation,
  disableBot,
  enableBot,
  unarchiveConversation,
  unassignConversation,
} from "../../integration/handlers/conversation-handler"
import type { ActionExecutionContext } from "../types"

export class ActionExecutor {
  /**
   * Execute a single action
   */
  async execute(context: ActionExecutionContext): Promise<void> {
    const { action, contactId, chatbotId } = context
    const actionType = action.type

    // Get conversation for contact (required by handlers)
    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId,
        chatbotId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (!conversation) {
      baseLogger.warn(`No conversation found for contact ${contactId}`)
      return
    }

    switch (actionType) {
      case TriggerAction.addTag:
        // Handler expects tag names array, not IDs
        await addContactTag({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C01" as const,
            tags: action.tags as string[],
          },
        })
        break

      case TriggerAction.removeTag:
        await removeContactTag({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C01" as const,
            tags: action.tags as string[],
          },
        })
        break

      case TriggerAction.setCustomField:
        // Handler uses ContactCustomField table
        await setContactCustomField({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C06" as const,
            inputCfId: "",
            operation: "O01" as const,
            outputCfId: action.customFieldId as string,
            value: action.value as string,
          },
        })
        break

      case TriggerAction.clearCustomField:
        await clearContactCustomField({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "C07" as const,
            inputCfId: action.customFieldId as string,
          },
        })
        break

      case TriggerAction.startAnotherFlow:
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            flowId: action.flowId as string,
          },
        })
        break

      case TriggerAction.archiveConversation:
        await archiveConversation({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I08" as const,
          },
        })
        break

      case TriggerAction.unarchiveConversation:
        await unarchiveConversation({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I09" as const,
          },
        })
        break

      case TriggerAction.assignConversation:
        await assignConversation({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I03" as const,
            assignedId: action.assignedId as string,
          },
        })
        break

      case TriggerAction.unassignConversation:
        await unassignConversation({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I05" as const,
          },
        })
        break

      case TriggerAction.disableBot:
        await disableBot({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I01" as const,
          },
        })
        break

      case TriggerAction.enableBot:
        await enableBot({
          conversation,
          flowVersionId: "",
          step: {
            id: "",
            stepType: "I02" as const,
          },
        })
        break

      default:
        baseLogger.warn(`Unknown action type: ${actionType}`)
    }
  }
}
