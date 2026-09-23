import { describe, expect, test, vi } from "vitest"

const actionExecutorMock = vi.hoisted(() => vi.fn())

vi.mock("../src/integration/handlers/ai-agent-actions/action-executor", () => ({
  executeAIAgentAction: actionExecutorMock,
}))

import { buildAIAgentActionsPrompt } from "../src/integration/handlers/ai-agent-actions/prompt"
import { createAIAgentActionsTool } from "../src/integration/handlers/ai-agent-actions/tool-executor"

describe("AI agent action prompt", () => {
  test("preserves persisted rule order and identifies only dynamic actions", () => {
    const prompt = buildAIAgentActionsPrompt({
      actionPrompt: "Use only explicit evidence.",
      rules: [
        {
          id: "first",
          when: "The customer explicitly asks for a demo",
          actions: [
            { id: "flow", type: "send_flow", flowId: "flow-1" },
            {
              id: "email",
              type: "set_custom_field",
              customFieldId: "field-1",
            },
          ],
        },
        {
          id: "second",
          when: "The customer asks for a human",
          actions: [{ id: "human", type: "transfer_to_human" }],
        },
      ],
    })

    expect(prompt).toContain("Use only explicit evidence.")
    expect(prompt.indexOf("Rule 1")).toBeLessThan(prompt.indexOf("Rule 2"))
    expect(prompt).toContain("ruleId: first")
    expect(prompt).toContain(
      "action email: set_custom_field (supply its grounded value)",
    )
    expect(prompt).toContain("Do not expose rule IDs")
  })
})

describe("AI agent actions native tool", () => {
  test("validates the whole call before execution and runs selected rules in persisted order", async () => {
    actionExecutorMock.mockImplementation(async ({ action }) => ({
      actionId: action.id,
      outcome: "executed",
      reason: "ok",
    }))
    const actionTool = createAIAgentActionsTool({
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
      executedRuleIds: new Set(),
      rules: [
        {
          id: "first",
          when: "first condition",
          actions: [{ id: "first-action", type: "archive" }],
        },
        {
          id: "second",
          when: "second condition",
          actions: [{ id: "second-action", type: "block_contact" }],
        },
      ],
    })
    if (!actionTool.execute) {
      throw new Error("AI action tool must be executable")
    }

    await actionTool.execute(
      {
        matches: [
          { ruleId: "second", values: [] },
          { ruleId: "first", values: [] },
        ],
      },
      { context: undefined, messages: [], toolCallId: "tool-1" },
    )

    expect(
      actionExecutorMock.mock.calls.map(([input]) => input.action.id),
    ).toEqual(["first-action", "second-action"])
  })

  test("rejects an invalid value before any configured action runs", async () => {
    actionExecutorMock.mockReset()
    const actionTool = createAIAgentActionsTool({
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
      executedRuleIds: new Set(),
      rules: [
        {
          id: "rule-1",
          when: "condition",
          actions: [{ id: "archive", type: "archive" }],
        },
      ],
    })
    if (!actionTool.execute) {
      throw new Error("AI action tool must be executable")
    }

    const result = await actionTool.execute(
      {
        matches: [
          { ruleId: "rule-1", values: [{ actionId: "archive", value: "x" }] },
        ],
      },
      { context: undefined, messages: [], toolCallId: "tool-1" },
    )

    expect(result).toMatchObject({
      skipped: [{ reason: "invalid_action_value" }],
    })
    expect(actionExecutorMock).not.toHaveBeenCalled()
  })
})
