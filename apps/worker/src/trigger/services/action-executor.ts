import baseLogger from "@chatbotx.io/logger"
import type { ActionExecutionContext, ActionExecutionOutcome } from "../types"
import { resolveTriggerActionHandler } from "./actions/registry"
import { createTriggerActionScope } from "./actions/scope"
import { skipped, type TriggerActionScope } from "./actions/types"

export class ActionExecutor {
  /**
   * `scope` memoizes the conversation and contact inbox across the actions of
   * one run; callers that run several actions for one contact create it once.
   */
  async execute(
    context: ActionExecutionContext,
    scope: TriggerActionScope = createTriggerActionScope(context),
  ): Promise<ActionExecutionOutcome> {
    const conversation = await scope.getConversation()
    if (!conversation) {
      baseLogger.warn(`No conversation found for contact ${context.contactId}`)
      return skipped("noConversation")
    }

    const handler = resolveTriggerActionHandler(context.action.type)
    if (!handler) {
      baseLogger.warn(`Unknown action type: ${String(context.action.type)}`)
      return skipped("unknownAction")
    }

    return await handler({ context, conversation, scope })
  }
}
