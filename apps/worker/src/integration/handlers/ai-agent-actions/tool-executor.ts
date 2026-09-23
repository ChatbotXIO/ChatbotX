import type { AIAgentActionRule } from "@chatbotx.io/database/partials"
import { type ToolSet, tool } from "ai"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  type AIAgentActionExecutionContext,
  executeAIAgentAction,
} from "./action-executor"

const toolInputSchema = z
  .object({
    matches: z
      .array(
        z
          .object({
            ruleId: z.string().trim().min(1),
            values: z
              .array(
                z.object({
                  actionId: z.string().trim().min(1),
                  value: z.string().max(5000),
                }),
              )
              .max(15)
              .default([]),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict()

type ToolInput = z.infer<typeof toolInputSchema>

const rejected = (reason: string) => ({
  executed: [],
  skipped: [{ reason }],
  failed: [],
})

/**
 * Builds the one native tool used by AI actions. The schema controls shape;
 * this executor additionally binds every value to a configured action/rule.
 */
export function createAIAgentActionsTool(input: {
  context: AIAgentActionExecutionContext
  executedRuleIds: Set<string>
  rules: AIAgentActionRule[]
}): ToolSet[string] {
  return tool({
    description:
      "Apply clearly matched, preconfigured AI action rules. Do not call for uncertain matches.",
    inputSchema: toolInputSchema,
    execute: async (call: ToolInput) => {
      const configuredRuleById = new Map(
        input.rules.map((rule) => [rule.id, rule] as const),
      )
      const calledRuleIds = new Set<string>()
      for (const match of call.matches) {
        const rule = configuredRuleById.get(match.ruleId)
        if (!rule) {
          return rejected("unknown_rule")
        }
        if (
          calledRuleIds.has(match.ruleId) ||
          input.executedRuleIds.has(match.ruleId)
        ) {
          return rejected("duplicate_rule")
        }
        calledRuleIds.add(match.ruleId)

        const actionById = new Map(
          rule.actions.map((action) => [action.id, action]),
        )
        const valueActionIds = new Set<string>()
        for (const value of match.values) {
          if (
            actionById.get(value.actionId)?.type !== "set_custom_field" ||
            valueActionIds.has(value.actionId)
          ) {
            return rejected("invalid_action_value")
          }
          valueActionIds.add(value.actionId)
        }
      }

      const outcomes: {
        executed: Array<{ actionId: string; ruleId: string }>
        skipped: Array<{ actionId?: string; reason: string; ruleId?: string }>
        failed: Array<{ actionId: string; reason: string; ruleId: string }>
      } = { executed: [], skipped: [], failed: [] }

      // Models may reorder calls; persisted configuration order is authoritative.
      for (const rule of input.rules) {
        const match = call.matches.find((item) => item.ruleId === rule.id)
        if (!match) {
          continue
        }
        const values = new Map<string, string>()
        for (const value of match.values) {
          values.set(value.actionId, value.value)
        }

        input.executedRuleIds.add(rule.id)
        for (const action of rule.actions) {
          const result = await executeAIAgentAction({
            action,
            context: { ...input.context, ruleId: rule.id },
            value: values.get(action.id),
          })
          logger.info(
            {
              workspaceId: input.context.workspaceId,
              conversationId: input.context.conversationId,
              contactId: input.context.contactId,
              ruleId: rule.id,
              actionId: action.id,
              actionType: action.type,
              outcome: result.outcome,
              reason: result.reason,
            },
            "[ai-agent-actions] action outcome",
          )
          if (result.outcome === "executed") {
            outcomes.executed.push({ actionId: action.id, ruleId: rule.id })
          } else if (result.outcome === "failed") {
            outcomes.failed.push({
              actionId: action.id,
              ruleId: rule.id,
              reason: result.reason,
            })
          } else {
            outcomes.skipped.push({
              actionId: action.id,
              ruleId: rule.id,
              reason: result.reason,
            })
          }
        }
      }
      return outcomes
    },
  })
}
