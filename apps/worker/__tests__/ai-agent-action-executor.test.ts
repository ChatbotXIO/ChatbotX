import { describe, expect, test, vi } from "vitest"

const {
  assignOneOrSkip,
  attachByNamesToContacts,
  detachByNamesFromContacts,
  findActiveById,
  findBy,
  findContactInbox,
  findMember,
  findTagsByIds,
  queueAdd,
} = vi.hoisted(() => ({
  assignOneOrSkip: vi.fn(),
  attachByNamesToContacts: vi.fn(),
  detachByNamesFromContacts: vi.fn(),
  findActiveById: vi.fn(),
  findBy: vi.fn(),
  findContactInbox: vi.fn(),
  findMember: vi.fn(),
  findTagsByIds: vi.fn(),
  queueAdd: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findByUncached: findContactInbox },
  contactCustomFieldService: {},
  contactService: {},
  conversationService: { assignOneOrSkip, findBy },
  createSourceTimezoneResolver: vi.fn(),
  customFieldService: {},
  flowService: { findActiveById },
  normalizeCustomFieldValueForStorage: vi.fn(),
  tagService: {
    attachByNamesToContacts,
    detachByNamesFromContacts,
    findManyByIds: findTagsByIds,
  },
  workspaceMemberService: { findByWorkspaceIdAndUserId: findMember },
}))

const isWorkspaceAdminMember = vi.hoisted(() => vi.fn())

vi.mock("@chatbotx.io/business/workspace-member/predicates", () => ({
  isWorkspaceAdminMember,
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: queueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn() },
}))

vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: vi.fn() },
}))

const { executeAIAgentAction } = await import(
  "../src/integration/handlers/ai-agent-actions/action-executor"
)

describe("AI agent action executor", () => {
  test("skips a user assignee who is no longer a workspace admin", async () => {
    findBy.mockResolvedValue({
      assignedInboxTeamId: null,
      assignedUserId: null,
      contactId: "contact-1",
    })
    findMember.mockResolvedValue({ userId: "user-1" })
    isWorkspaceAdminMember.mockReturnValue(false)

    const result = await executeAIAgentAction({
      action: {
        id: "assign-demoted-user",
        type: "assign_conversation",
        assignedId: "u_user-1",
      },
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "rule-1",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
    })

    expect(result).toEqual({
      actionId: "assign-demoted-user",
      outcome: "skipped",
      reason: "stale_target",
    })
    expect(assignOneOrSkip).not.toHaveBeenCalled()
  })

  test("skips a flow that is no longer active and published", async () => {
    findBy.mockResolvedValue({ contactId: "contact-1" })
    findActiveById.mockResolvedValue(undefined)

    const result = await executeAIAgentAction({
      action: { id: "send-inactive-flow", type: "send_flow", flowId: "flow-1" },
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "rule-1",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
    })

    expect(result).toEqual({
      actionId: "send-inactive-flow",
      outcome: "skipped",
      reason: "stale_target",
    })
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("assigns a conversation to an Inbox Team through the shared assignee path", async () => {
    findBy.mockResolvedValue({
      assignedInboxTeamId: null,
      assignedUserId: null,
      contactId: "contact-1",
    })

    const result = await executeAIAgentAction({
      action: {
        id: "assign-team",
        type: "assign_conversation",
        assignedId: "t_team-1",
      },
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "rule-1",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
    })

    expect(result).toEqual({
      actionId: "assign-team",
      outcome: "executed",
      reason: "ok",
    })
    expect(assignOneOrSkip).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversation: { id: "conversation-1", contactId: "contact-1" },
      assignedId: "t_team-1",
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "aiAgentActions",
        triggerType: "ai_agent_action",
      },
    })
  })

  test("adds a tag through the full tag service path", async () => {
    findBy.mockResolvedValue({ contactId: "contact-1" })
    findTagsByIds.mockResolvedValue([{ id: "tag-1", name: "vip" }])
    findContactInbox.mockResolvedValue({
      channel: "messenger",
      id: "contact-inbox-1",
      inboxId: "inbox-1",
    })

    const result = await executeAIAgentAction({
      action: { id: "add-vip", type: "add_tag", tagId: "tag-1" },
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "rule-1",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
    })

    expect(result).toEqual({
      actionId: "add-vip",
      outcome: "executed",
      reason: "ok",
    })
    expect(attachByNamesToContacts).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      names: ["vip"],
      contactInbox: {
        channel: "messenger",
        id: "contact-inbox-1",
        inboxId: "inbox-1",
      },
      emitFor: "newlyLinked",
    })
  })

  test("removes a tag through the full tag service path", async () => {
    findBy.mockResolvedValue({ contactId: "contact-1" })
    findTagsByIds.mockResolvedValue([{ id: "tag-1", name: "vip" }])
    findContactInbox.mockResolvedValue({
      channel: "messenger",
      id: "contact-inbox-1",
      inboxId: "inbox-1",
    })

    const result = await executeAIAgentAction({
      action: { id: "remove-vip", type: "remove_tag", tagId: "tag-1" },
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "rule-1",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
    })

    expect(result).toEqual({
      actionId: "remove-vip",
      outcome: "executed",
      reason: "ok",
    })
    expect(detachByNamesFromContacts).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactIds: ["contact-1"],
      names: ["vip"],
      contactInboxId: "contact-inbox-1",
    })
  })
})
