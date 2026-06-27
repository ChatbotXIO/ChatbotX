import {
  contactCustomFieldService,
  contactService,
  conversationService,
  flowService,
  isRichSystemContactField,
  workspaceMemberService,
} from "@chatbotx.io/business"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { handoffExecutorService } from "../../../trigger/services/handoff-executor.service"
import { attachTagsByNames, detachTagsByNames } from "../contact"
import type { RichAction, RichResponseContext } from "."

export type RichActionExecutionResult = {
  executed: number
  failed: Array<{ action: RichAction["action"]; reason: string }>
}

export async function executeRichActions(
  actions: RichAction[],
  context: RichResponseContext,
): Promise<RichActionExecutionResult> {
  const result: RichActionExecutionResult = { executed: 0, failed: [] }

  for (const action of actions) {
    try {
      await executeRichAction(action, context)
      result.executed += 1
    } catch (error) {
      const normalized = normalizeError(error)
      const reason = normalized.message || "unknown_error"
      result.failed.push({ action: action.action, reason })
      logger.warn(
        {
          workspaceId: context.workspaceId,
          conversationId: context.conversationId,
          contactId: context.contactId,
          executionId: context.executionId,
          action: action.action,
          error: normalized,
        },
        "[rich-response] action failed",
      )

      if (
        action.action === "send_flow" ||
        action.action === "transfer_conversation_to"
      ) {
        break
      }
    }
  }

  return result
}

async function executeRichAction(
  action: RichAction,
  context: RichResponseContext,
): Promise<void> {
  switch (action.action) {
    case "add_tag":
      await attachTagsByNames(context.workspaceId, context.contactId, [
        action.tag_name,
      ])
      return
    case "remove_tag":
      await detachTagsByNames(context.workspaceId, context.contactId, [
        action.tag_name,
      ])
      return
    case "set_field_value":
      if (isRichSystemContactField(action.field_name)) {
        await contactService.setRichSystemFieldByKey({
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          fieldName: action.field_name,
          value: action.value,
        })
        return
      }
      await contactCustomFieldService.setValueByKey({
        workspaceId: context.workspaceId,
        contactId: context.contactId,
        keyword: action.field_name,
        value: action.value,
      })
      return
    case "unset_field_value":
      if (isRichSystemContactField(action.field_name)) {
        await contactService.unsetRichSystemFieldByKey({
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          fieldName: action.field_name,
        })
        return
      }
      await contactCustomFieldService.deleteByKey({
        workspaceId: context.workspaceId,
        contactId: context.contactId,
        keyword: action.field_name,
      })
      return
    case "send_flow": {
      const exists = await flowService.exists(
        context.workspaceId,
        action.flow_id,
      )
      if (!exists) {
        throw new Error("Flow not found")
      }
      await integrationQueue.add(
        IntegrationJobAction.sendFlow,
        {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: context.conversationId,
            contactInboxId: context.contactInboxId,
            flowId: action.flow_id,
          },
        },
        {
          jobId: [
            "rich-response",
            context.conversationId,
            context.executionId,
            "send-flow",
            action.flow_id,
          ].join("-"),
        },
      )
      return
    }
    case "transfer_conversation_to":
      await handoffExecutorService.execute({
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        contactId: context.contactId,
        reason: "user_requested_human",
        source: "ai_system_tool",
        channel: context.channel,
      })
      return
    case "assign_conversation": {
      const member = await workspaceMemberService.findByWorkspaceIdAndUserId({
        workspaceId: context.workspaceId,
        userId: action.admin_id,
      })
      if (!member) {
        throw new Error("Workspace member not found")
      }
      await conversationService.updateAssignment({
        workspaceId: context.workspaceId,
        conversations: [
          { id: context.conversationId, contactId: context.contactId },
        ],
        assignedUserId: action.admin_id,
        assignedInboxTeamId: null,
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "richResponse.assignConversation",
          triggerType: "rich_response_action",
        },
      })
      return
    }
    case "unassign_conversation":
      await conversationService.updateAssignment({
        workspaceId: context.workspaceId,
        conversations: [
          { id: context.conversationId, contactId: context.contactId },
        ],
        assignedUserId: null,
        assignedInboxTeamId: null,
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "richResponse.unassignConversation",
          triggerType: "rich_response_action",
        },
      })
      return
    default:
      return
  }
}
