import type { StepResult, ToolExecutionEndEvent, ToolSet } from "ai"
import { beforeEach, describe, expect, test, vi } from "vitest"

const workerLoggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({ logger: workerLoggerMock }))

const { createAgentToolStatsCollector } = await import(
  "../src/integration/handlers/shared/agent-tool-stats"
)

const context = {
  conversationId: "conv-1",
  logPrefix: "test-runner",
  modelId: "gpt-test",
  provider: "openai",
  workspaceId: "ws-1",
}

function makeStep(overrides: {
  content?: Array<{ type: string }>
  finishReason?: string
  stepNumber?: number
  toolCalls?: Array<{ toolName: string }>
  toolResults?: unknown[]
}): StepResult<ToolSet> {
  return {
    content: [],
    finishReason: "tool-calls",
    rawFinishReason: "tool_calls",
    stepNumber: 0,
    toolCalls: [],
    toolResults: [],
    ...overrides,
  } as never
}

function makeToolEnd(
  toolOutput: { type: "tool-error"; error: unknown } | { type: "tool-result" },
): ToolExecutionEndEvent<ToolSet> {
  return {
    toolCall: { toolCallId: "call-1", toolName: "failing_tool" },
    toolExecutionMs: 42,
    toolOutput,
  } as never
}

describe("createAgentToolStatsCollector", () => {
  beforeEach(() => {
    workerLoggerMock.warn.mockReset()
  })

  test("counts an execution error once even though both callbacks fire", () => {
    const collector = createAgentToolStatsCollector(context)

    collector.onToolExecutionEnd(
      makeToolEnd({ type: "tool-error", error: new Error("boom") }),
    )
    collector.onStepEnd(
      makeStep({
        content: [{ type: "tool-call" }, { type: "tool-error" }],
        toolCalls: [{ toolName: "failing_tool" }],
      }),
    )

    expect(collector.toToolStats()).toMatchObject({
      steps: 1,
      toolCallsCount: 1,
      toolResultsCount: 0,
      toolErrorsCount: 1,
      toolNames: ["failing_tool"],
    })
    expect(collector.hasToolActivity()).toBe(true)
    expect(workerLoggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        durationMs: 42,
        errorMessage: "boom",
        toolName: "failing_tool",
        workspaceId: "ws-1",
      }),
      "[test-runner] tool execution failed",
    )
  })

  test("counts invalid/no-such-tool errors that only appear in step content", () => {
    const collector = createAgentToolStatsCollector(context)

    collector.onStepEnd(
      makeStep({ content: [{ type: "tool-error" }, { type: "tool-error" }] }),
    )

    expect(collector.toToolStats().toolErrorsCount).toBe(2)
    expect(workerLoggerMock.warn).not.toHaveBeenCalled()
  })

  test("reports successful tool results without errors", () => {
    const collector = createAgentToolStatsCollector(context)

    collector.onToolExecutionEnd(makeToolEnd({ type: "tool-result" }))
    collector.onStepEnd(
      makeStep({
        content: [{ type: "tool-call" }, { type: "tool-result" }],
        toolCalls: [{ toolName: "lookup" }],
        toolResults: [{}],
      }),
    )
    collector.onStepEnd(
      makeStep({
        content: [{ type: "text" }],
        finishReason: "stop",
        stepNumber: 1,
      }),
    )

    expect(collector.toToolStats()).toMatchObject({
      steps: 2,
      toolCallsCount: 1,
      toolResultsCount: 1,
      toolErrorsCount: 0,
      toolNames: ["lookup"],
    })
    expect(collector.hasToolName("lookup")).toBe(true)
    expect(workerLoggerMock.warn).not.toHaveBeenCalled()
  })

  test("caps reported tool names and finish reasons at 10", () => {
    const collector = createAgentToolStatsCollector(context)

    for (let stepNumber = 0; stepNumber < 12; stepNumber += 1) {
      collector.onStepEnd(
        makeStep({
          stepNumber,
          toolCalls: [{ toolName: `tool_${stepNumber}` }],
        }),
      )
    }

    const stats = collector.toToolStats()
    expect(stats.steps).toBe(12)
    expect(stats.toolCallsCount).toBe(12)
    expect(stats.toolNames).toHaveLength(10)
    expect(stats.finishReasons).toHaveLength(10)
  })
})
