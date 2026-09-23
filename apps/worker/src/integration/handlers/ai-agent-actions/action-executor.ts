import {
  contactCustomFieldService,
  contactInboxService,
  contactService,
  conversationService,
  createSourceTimezoneResolver,
  customFieldService,
  flowService,
  normalizeCustomFieldValueForStorage,
  tagService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { isWorkspaceAdminMember } from "@chatbotx.io/business/workspace-member/predicates"
import type {
  AIAgentAction,
  CustomFieldType,
} from "@chatbotx.io/database/partials"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { handoffExecutorService } from "../../../trigger/services/handoff-executor.service"

export type AIAgentActionOutcome = "executed" | "failed" | "skipped"

export type AIAgentActionExecutionContext = {
  channel?: string
  contactId: string
  contactInboxId: string
  conversationId: string
  ruleId: string
  triggerMessageId: string
  workspaceId: string
  workspaceTimezone?: string
}

export type AIAgentActionResult = {
  actionId: string
  outcome: AIAgentActionOutcome
  reason: string
}

const triggerContext = {
  triggerSource: "worker",
  triggerHandler: "aiAgentActions",
  triggerType: "ai_agent_action",
}

async function normalizeActionValue(input: {
  customFieldId: string
  value: string
  context: AIAgentActionExecutionContext
}): Promise<string | null> {
  const field = await customFieldService.findBy({
    where: {
      id: input.customFieldId,
      workspaceId: input.context.workspaceId,
    },
  })
  if (!field) {
    return null
  }
  return await normalizeCustomFieldValueForStorage({
    type: field.type as CustomFieldType,
    value: input.value,
    resolveSourceTimezone: createSourceTimezoneResolver({
      workspaceId: input.context.workspaceId,
      contactId: input.context.contactId,
      explicitSourceTimezone: input.context.workspaceTimezone,
    }),
  })
}

export async function executeAIAgentAction(input: {
  action: AIAgentAction
  context: AIAgentActionExecutionContext
  value?: string
}): Promise<AIAgentActionResult> {
  const { action, context } = input
  const actionId = action.id
  try {
    const conversation = await conversationService.findBy({
      where: {
        id: context.conversationId,
        workspaceId: context.workspaceId,
      },
    })
    if (!conversation || conversation.contactId !== context.contactId) {
      return {
        actionId: action.id,
        outcome: "skipped",
        reason: "stale_conversation",
      }
    }

    switch (action.type) {
      case "send_flow": {
        const flow = await flowService.findActiveById({
          id: action.flowId,
          workspaceId: context.workspaceId,
        })
        if (!flow?.currentVersionId) {
          return {
            actionId: action.id,
            outcome: "skipped",
            reason: "stale_target",
          }
        }
        await integrationQueue.add(
          IntegrationJobAction.sendFlow,
          {
            type: IntegrationJobAction.sendFlow,
            data: {
              conversationId: context.conversationId,
              contactInboxId: context.contactInboxId,
              flowId: action.flowId,
              origin: webhookChannelOrigin(),
            },
          },
          {
            jobId: `ai-agent-action-${context.conversationId}-${context.triggerMessageId}-${action.id}`,
          },
        )
        break
      }
      case "assign_conversation": {
        const assignedId =
          "assignedId" in action ? action.assignedId : `u_${action.adminId}`
        const assignedUserId = assignedId.startsWith("u_")
          ? assignedId.slice(2)
          : null
        const assignedInboxTeamId = assignedId.startsWith("t_")
          ? assignedId.slice(2)
          : null
        if (
          conversation.assignedUserId === assignedUserId &&
          conversation.assignedInboxTeamId === assignedInboxTeamId
        ) {
          return { actionId: action.id, outcome: "skipped", reason: "no_op" }
        }
        if (assignedUserId) {
          const member =
            await workspaceMemberService.findByWorkspaceIdAndUserId({
              workspaceId: context.workspaceId,
              userId: assignedUserId,
            })
          if (!(member && isWorkspaceAdminMember(member))) {
            return {
              actionId: action.id,
              outcome: "skipped",
              reason: "stale_target",
            }
          }
        }
        await conversationService.assignOneOrSkip({
          workspaceId: context.workspaceId,
          conversation: {
            id: context.conversationId,
            contactId: context.contactId,
          },
          assignedId,
          triggerContext,
        })
        break
      }
      case "remove_assignment":
        if (
          !(conversation.assignedUserId || conversation.assignedInboxTeamId)
        ) {
          return { actionId: action.id, outcome: "skipped", reason: "no_op" }
        }
        await conversationService.updateAssignment({
          workspaceId: context.workspaceId,
          conversations: [
            { id: context.conversationId, contactId: context.contactId },
          ],
          assignedUserId: null,
          assignedInboxTeamId: null,
          triggerContext,
        })
        break
      case "transfer_to_human":
        await handoffExecutorService.execute({
          workspaceId: context.workspaceId,
          conversationId: context.conversationId,
          contactId: context.contactId,
          reason: "ai_agent_rule",
          source: "ai_system_tool",
          channel: context.channel,
        })
        break
      case "add_tag":
      case "remove_tag": {
        const [tag] = await tagService.findManyByIds({
          workspaceId: context.workspaceId,
          ids: [action.tagId],
        })
        if (!tag) {
          return {
            actionId: action.id,
            outcome: "skipped",
            reason: "stale_target",
          }
        }
        const contactInbox = await contactInboxService.findByUncached({
          where: {
            id: context.contactInboxId,
            contactId: context.contactId,
          },
        })
        if (action.type === "add_tag") {
          await tagService.attachByNamesToContacts({
            workspaceId: context.workspaceId,
            contactIds: [context.contactId],
            names: [tag.name],
            contactInbox,
            // AI tool calls can be retried; only newly attached tags should
            // emit triggers or enqueue channel-label synchronization.
            emitFor: "newlyLinked",
          })
        } else {
          await tagService.detachByNamesFromContacts({
            workspaceId: context.workspaceId,
            contactIds: [context.contactId],
            names: [tag.name],
            contactInboxId: contactInbox?.id,
          })
        }
        break
      }
      case "set_custom_field": {
        if (input.value === undefined) {
          return {
            actionId: action.id,
            outcome: "skipped",
            reason: "missing_value",
          }
        }
        let value: string | null
        try {
          value = await normalizeActionValue({
            customFieldId: action.customFieldId,
            value: input.value,
            context,
          })
        } catch {
          return {
            actionId: action.id,
            outcome: "skipped",
            reason: "invalid_value",
          }
        }
        if (value === null) {
          return {
            actionId: action.id,
            outcome: "skipped",
            reason: "stale_target",
          }
        }
        await contactCustomFieldService.setValues({
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          fields: [{ customFieldId: action.customFieldId, value }],
          sourceTimezoneOverride: context.workspaceTimezone,
          contactInboxId: context.contactInboxId,
        })
        break
      }
      case "clear_custom_field": {
        const field = await customFieldService.findBy({
          where: { id: action.customFieldId, workspaceId: context.workspaceId },
        })
        if (!field) {
          return {
            actionId: action.id,
            outcome: "skipped",
            reason: "stale_target",
          }
        }
        await contactCustomFieldService.deleteByKey({
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          keyword: action.customFieldId,
          contactInboxId: context.contactInboxId,
        })
        break
      }
      case "mark_follow_up":
      case "remove_follow_up":
        if (conversation.followed === (action.type === "mark_follow_up")) {
          return { actionId: action.id, outcome: "skipped", reason: "no_op" }
        }
        await conversationService.setFollowed({
          workspaceId: context.workspaceId,
          id: context.conversationId,
          followed: action.type === "mark_follow_up",
          triggerContext,
        })
        break
      case "transfer_to_bot":
        if (conversation.botEnabled) {
          return { actionId: action.id, outcome: "skipped", reason: "no_op" }
        }
        await conversationService.setBotEnabledByIds({
          workspaceId: context.workspaceId,
          ids: [context.conversationId],
          botEnabled: true,
          triggerContext,
        })
        break
      case "archive":
        if (conversation.archivedAt) {
          return { actionId: action.id, outcome: "skipped", reason: "no_op" }
        }
        await conversationService.archiveByIds({
          workspaceId: context.workspaceId,
          ids: [context.conversationId],
          triggerContext,
        })
        break
      case "block_contact":
        {
          const contact = await contactService.findById({
            workspaceId: context.workspaceId,
            id: context.contactId,
          })
          if (!contact) {
            return {
              actionId: action.id,
              outcome: "skipped",
              reason: "stale_contact",
            }
          }
          if (contact.blockedAt) {
            return { actionId: action.id, outcome: "skipped", reason: "no_op" }
          }
        }
        await contactService.block({
          workspaceId: context.workspaceId,
          id: context.contactId,
        })
        break
      default:
        return {
          actionId,
          outcome: "skipped",
          reason: "unsupported_action",
        }
    }
    return { actionId: action.id, outcome: "executed", reason: "ok" }
  } catch (error) {
    const err = normalizeError(error)
    logger.warn(
      {
        err,
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        contactId: context.contactId,
        ruleId: context.ruleId,
        actionId: action.id,
        actionType: action.type,
        outcome: "failed",
        reason: "operation_failed",
      },
      "[ai-agent-actions] action execution failed",
    )
    return {
      actionId: action.id,
      outcome: "failed",
      reason: "operation_failed",
    }
  }
}
