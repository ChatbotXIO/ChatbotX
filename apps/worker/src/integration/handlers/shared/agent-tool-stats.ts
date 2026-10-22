import type { StepResult, ToolExecutionEndEvent, ToolSet } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"

const MAX_REPORTED_ITEMS = 10

export type AgentToolStats = {
  steps: number
  toolCallsCount: number
  toolResultsCount: number
  toolErrorsCount: number
  toolNames: string[]
  finishReasons: Array<{
    stepNumber: number
    finishReason: string
    rawFinishReason?: string
  }>
}

/**
 * Collects per-run tool analytics from the AI SDK v7 `streamText` callbacks.
 *
 * Tool failures surface as `tool-error` parts in `step.content` (they never
 * appear in `toolResults`), so errors are counted only in `onStepEnd`;
 * `onToolExecutionEnd` only logs, which keeps one increment per failure.
 */
export function createAgentToolStatsCollector(context: {
  conversationId: string
  logPrefix: string
  modelId: string
  provider: string
  workspaceId: string
}) {
  const toolNames = new Set<string>()
  const finishReasons: AgentToolStats["finishReasons"] = []
  let steps = 0
  let toolCallsCount = 0
  let toolResultsCount = 0
  let toolErrorsCount = 0

  // Generic so the callbacks fit `streamText` calls whose `tools` keep their
  // literal (non-widened) type.
  const onStepEnd = <TOOLS extends ToolSet>(step: StepResult<TOOLS>) => {
    steps = Math.max(steps, step.stepNumber + 1)
    finishReasons.push({
      stepNumber: step.stepNumber,
      finishReason: step.finishReason,
      rawFinishReason: step.rawFinishReason,
    })

    toolCallsCount += step.toolCalls.length
    for (const call of step.toolCalls) {
      if (call?.toolName) {
        toolNames.add(call.toolName)
      }
    }

    toolResultsCount += step.toolResults.length
    for (const part of step.content) {
      if (part.type === "tool-error") {
        toolErrorsCount += 1
      }
    }
  }

  const onToolExecutionEnd = <TOOLS extends ToolSet>({
    toolCall,
    toolExecutionMs,
    toolOutput,
  }: ToolExecutionEndEvent<TOOLS>) => {
    if (toolOutput.type !== "tool-error") {
      return
    }

    const normalizedError = normalizeError(toolOutput.error)
    logger.warn(
      {
        provider: context.provider,
        modelId: context.modelId,
        conversationId: context.conversationId,
        workspaceId: context.workspaceId,
        toolName: toolCall?.toolName,
        toolCallId: toolCall?.toolCallId,
        durationMs: toolExecutionMs,
        err: normalizedError,
        errorMessage: normalizedError.message,
      },
      `[${context.logPrefix}] tool execution failed`,
    )
  }

  const hasToolActivity = () => toolCallsCount > 0 || toolResultsCount > 0

  const hasToolName = (name: string) => toolNames.has(name)

  const toToolStats = (): AgentToolStats => ({
    steps,
    toolCallsCount,
    toolResultsCount,
    toolErrorsCount,
    toolNames: Array.from(toolNames).slice(0, MAX_REPORTED_ITEMS),
    finishReasons: finishReasons.slice(0, MAX_REPORTED_ITEMS),
  })

  return {
    hasToolActivity,
    hasToolName,
    onStepEnd,
    onToolExecutionEnd,
    toToolStats,
  }
}
