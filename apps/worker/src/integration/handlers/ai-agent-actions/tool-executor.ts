import type { AIAgentActionRule } from "@chatbotx.io/database/partials"
import { type Tool, tool } from "ai"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import {
  type AIAgentActionExecutionContext,
  executeAIAgentAction,
} from "./action-executor"

type ToolValue = { actionId: string; value: string }
type ToolMatch = { ruleId: string; values?: ToolValue[] }
type ToolInput = { matches: ToolMatch[] }

type ToolOutput = {
  executed: Array<{ actionId: string; ruleId: string }>
  failed: Array<{ actionId: string; reason: string; ruleId: string }>
  skipped: Array<{ actionId?: string; reason: string; ruleId?: string }>
}

function buildActionToolDescription(rules: AIAgentActionRule[]): string {
  const configuredRules = rules
    .map(
      (rule, index) =>
        `${index + 1}. ruleId: ${rule.id}\n   When: ${rule.when}`,
    )
    .join("\n")

  const instructions = [
    "Apply clearly matched, preconfigured AI action rules.",
    "Call this tool only when the current customer message clearly satisfies one or more configured rules.",
    "Multiple rules may match. Do not call this tool for an uncertain or no-match message.",
    "Configured rules in persisted order:",
    configuredRules,
  ]
  return instructions.join("\n")
}

function buildMatchSchema(rule: AIAgentActionRule): z.ZodType<ToolMatch> {
  const valueActionIds = rule.actions
    .filter((action) => action.type === "set_custom_field")
    .map((action) => action.id)

  if (valueActionIds.length === 0) {
    return z.object({ ruleId: z.literal(rule.id) }).strict()
  }

  return z
    .object({
      ruleId: z.literal(rule.id),
      values: z
        .array(
          z
            .object({
              actionId: z.enum(valueActionIds),
              value: z.string().max(5000),
            })
            .strict(),
        )
        .max(valueActionIds.length)
        .default([]),
    })
    .strict()
}

function buildToolInputSchema(
  rules: AIAgentActionRule[],
): z.ZodType<ToolInput> {
  const matchSchemas = rules.map(buildMatchSchema)
  const [firstMatchSchema, ...remainingMatchSchemas] = matchSchemas
  if (!firstMatchSchema) {
    throw new Error("AI Action tool requires at least one configured rule")
  }
  const matchSchema = remainingMatchSchemas.length
    ? z.union([firstMatchSchema, ...remainingMatchSchemas])
    : firstMatchSchema

  return z
    .object({
      matches: z.array(matchSchema).min(1).max(rules.length),
    })
    .strict()
}

const rejected = (reason: string): ToolOutput => ({
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
}): Tool<ToolInput, ToolOutput> {
  return tool({
    description: buildActionToolDescription(input.rules),
    inputSchema: buildToolInputSchema(input.rules),
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
        for (const value of match.values ?? []) {
          if (
            actionById.get(value.actionId)?.type !== "set_custom_field" ||
            valueActionIds.has(value.actionId)
          ) {
            return rejected("invalid_action_value")
          }
          valueActionIds.add(value.actionId)
        }
      }

      // Reserve every validated rule synchronously, before the first await.
      // AI SDK may execute tool calls in parallel, so delaying this claim until
      // action execution would let two calls run the same rule concurrently.
      for (const match of call.matches) {
        input.executedRuleIds.add(match.ruleId)
      }

      const outcomes: ToolOutput = { executed: [], skipped: [], failed: [] }

      // Models may reorder calls; persisted configuration order is authoritative.
      for (const rule of input.rules) {
        const match = call.matches.find((item) => item.ruleId === rule.id)
        if (!match) {
          continue
        }
        const values = new Map<string, string>()
        for (const value of match.values ?? []) {
          values.set(value.actionId, value.value)
        }

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
