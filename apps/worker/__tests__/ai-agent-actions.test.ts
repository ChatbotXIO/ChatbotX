import { describe, expect, test, vi } from "vitest"

const actionExecutorMock = vi.hoisted(() => vi.fn())

vi.mock("../src/integration/handlers/ai-agent-actions/action-executor", () => ({
  executeAIAgentAction: actionExecutorMock,
}))

import { hasValidHandoffReentryEvidence } from "../src/integration/handlers/ai-agent-actions/handoff-reentry-selection"
import { buildAIAgentActionsPrompt } from "../src/integration/handlers/ai-agent-actions/prompt"
import { createAIAgentActionsTool } from "../src/integration/handlers/ai-agent-actions/tool-executor"

describe("AI agent action prompt", () => {
  test("keeps routing data out of the private action policy", () => {
    const prompt = buildAIAgentActionsPrompt({
      actionPrompt: "Use only explicit evidence.",
    })

    expect(prompt).toContain("Use only explicit evidence.")
    expect(prompt).toContain(
      "ACTION MATCHING INSTRUCTIONS (USER CONFIGURATION):",
    )
    expect(prompt).toContain("Use the native AI Action tool")
    expect(prompt).not.toContain("ruleId:")
    expect(prompt).not.toContain("When:")
  })

  test("defines a classifier policy that permits an explicit no-match", async () => {
    const { buildHandoffReentryClassifierPrompt } = await import(
      "../src/integration/handlers/ai-agent-actions/prompt"
    )
    const prompt = buildHandoffReentryClassifierPrompt({ actionPrompt: null })

    expect(prompt).toContain("matches: []")
    expect(prompt).toContain("untrusted data")
    expect(prompt).toContain('"alo"')
    expect(prompt).toContain("When condition")
  })
})

describe("handoff re-entry evidence", () => {
  test("accepts a meaningful quote from the current message", () => {
    expect(
      hasValidHandoffReentryEvidence(
        "Tôi muốn xem thông tin tự động trước, chưa cần gặp nhân viên.",
        "muốn xem thông tin tự động trước",
      ),
    ).toBe(true)
  })

  test("rejects greetings and fabricated quotes", () => {
    expect(hasValidHandoffReentryEvidence("alo", "alo")).toBe(false)
    expect(
      hasValidHandoffReentryEvidence(
        "Tôi muốn xem thông tin tự động trước.",
        "tôi muốn dùng chatbot ngay",
      ),
    ).toBe(false)
  })
})

describe("AI agent actions native tool", () => {
  test("generates the tool description from persisted AC1 rules without targets", () => {
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
          id: "6df18bde-cadc-4c42-bfc5-4a641368d3f1",
          when: "Khách hỏi xin bảng giá.",
          actions: [
            {
              id: "send-price-list",
              type: "send_flow",
              flowId: "private-flow-id",
            },
          ],
        },
        {
          id: "129328ca-c61e-488b-9d15-7e6e8c7bf1a0",
          when: "Khách muốn được nhân viên tư vấn để mua hàng",
          actions: [
            {
              id: "assign-sales",
              type: "assign_conversation",
              assignedId: "u_private-admin-id",
            },
          ],
        },
        {
          id: "44784e29-d2e5-4ae3-abd1-5408b7fb2813",
          when: "Khách không cần tư vấn viên riêng nữa.",
          actions: [{ id: "remove-sales", type: "remove_assignment" }],
        },
      ],
    })

    expect(actionTool.description).toContain("Khách hỏi xin bảng giá.")
    expect(actionTool.description).toContain(
      "Khách muốn được nhân viên tư vấn để mua hàng",
    )
    expect(actionTool.description).toContain(
      "Khách không cần tư vấn viên riêng nữa.",
    )
    expect(actionTool.description).not.toContain("private-flow-id")
    expect(actionTool.description).not.toContain("u_private-admin-id")
  })

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
      { matches: [{ ruleId: "second" }, { ruleId: "first" }] },
      { experimental_context: undefined, messages: [], toolCallId: "tool-1" },
    )

    expect(
      actionExecutorMock.mock.calls.map(([input]) => input.action.id),
    ).toEqual(["first-action", "second-action"])
  })

  test("executes a rule only once when tool calls run in parallel", async () => {
    actionExecutorMock.mockReset()
    let finishFirstAction: (() => void) | undefined
    actionExecutorMock.mockImplementation(
      async () =>
        await new Promise((resolve) => {
          finishFirstAction = () =>
            resolve({
              actionId: "archive",
              outcome: "executed",
              reason: "ok",
            })
        }),
    )
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

    const firstCall = actionTool.execute(
      { matches: [{ ruleId: "rule-1" }] },
      { experimental_context: undefined, messages: [], toolCallId: "tool-1" },
    )
    await vi.waitFor(() => expect(actionExecutorMock).toHaveBeenCalledOnce())
    const secondCall = actionTool.execute(
      { matches: [{ ruleId: "rule-1" }] },
      { experimental_context: undefined, messages: [], toolCallId: "tool-2" },
    )

    await expect(secondCall).resolves.toMatchObject({
      skipped: [{ reason: "duplicate_rule" }],
    })
    finishFirstAction?.()
    await firstCall
    expect(actionExecutorMock).toHaveBeenCalledOnce()
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
      { experimental_context: undefined, messages: [], toolCallId: "tool-1" },
    )

    expect(result).toMatchObject({
      skipped: [{ reason: "invalid_action_value" }],
    })
    expect(actionExecutorMock).not.toHaveBeenCalled()
  })
})
