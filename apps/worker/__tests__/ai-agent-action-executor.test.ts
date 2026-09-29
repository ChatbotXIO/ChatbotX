import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  assignOneOrSkip,
  attachByNamesToContacts,
  archiveByIds,
  blockContact,
  clearCustomField,
  detachByNamesFromContacts,
  findActiveById,
  findBy,
  findContactInbox,
  findMember,
  findTagsByIds,
  findContact,
  handoff,
  listTeams,
  queueAdd,
  setBotEnabled,
  setCustomField,
  setFollowed,
  updateAssignment,
} = vi.hoisted(() => ({
  assignOneOrSkip: vi.fn(),
  attachByNamesToContacts: vi.fn(),
  archiveByIds: vi.fn(),
  blockContact: vi.fn(),
  clearCustomField: vi.fn(),
  detachByNamesFromContacts: vi.fn(),
  findActiveById: vi.fn(),
  findBy: vi.fn(),
  findContactInbox: vi.fn(),
  findMember: vi.fn(),
  findTagsByIds: vi.fn(),
  findContact: vi.fn(),
  handoff: vi.fn(),
  listTeams: vi.fn(),
  queueAdd: vi.fn(),
  setBotEnabled: vi.fn(),
  setCustomField: vi.fn(),
  setFollowed: vi.fn(),
  updateAssignment: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findByUncached: findContactInbox },
  contactCustomFieldService: {
    deleteByKey: clearCustomField,
    setValues: setCustomField,
  },
  contactService: { block: blockContact, findById: findContact },
  conversationService: {
    archiveByIds,
    assignOneOrSkip,
    findBy,
    setBotEnabledByIds: setBotEnabled,
    setFollowed,
    updateAssignment,
  },
  createSourceTimezoneResolver: vi.fn(),
  customFieldService: { findBy },
  flowService: { findActiveById },
  inboxTeamService: { listByWorkspace: listTeams },
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
  handoffExecutorService: { execute: handoff },
}))

const { executeAIAgentAction } = await import(
  "../src/integration/handlers/ai-agent-actions/action-executor"
)

describe("AI agent action executor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTeams.mockResolvedValue([{ id: "team-1" }])
    findBy.mockResolvedValue({
      archivedAt: null,
      assignedInboxTeamId: null,
      assignedUserId: null,
      botEnabled: false,
      contactId: "contact-1",
      followed: false,
      type: "text",
    })
    findActiveById.mockResolvedValue({ currentVersionId: "version-1" })
    findTagsByIds.mockResolvedValue([{ id: "tag-1", name: "vip" }])
    findContactInbox.mockResolvedValue({ id: "contact-inbox-1" })
    findContact.mockResolvedValue({ blockedAt: null })
  })

  test.each([
    { id: "flow", type: "send_flow", flowId: "flow-1" },
    { id: "assign-admin", type: "assign_conversation", assignedId: "u_user-1" },
    { id: "remove-assignment", type: "remove_assignment" },
    { id: "human", type: "transfer_to_human" },
    { id: "add-tag", type: "add_tag", tagId: "tag-1" },
    { id: "remove-tag", type: "remove_tag", tagId: "tag-1" },
    { id: "set-field", type: "set_custom_field", customFieldId: "field-1" },
    { id: "clear-field", type: "clear_custom_field", customFieldId: "field-1" },
    { id: "follow", type: "mark_follow_up" },
    { id: "unfollow", type: "remove_follow_up", followed: true },
    { id: "bot", type: "transfer_to_bot" },
    { id: "archive", type: "archive" },
    { id: "block", type: "block_contact" },
  ] as const)("maps $type to an execution primitive", async (action) => {
    if (action.type === "assign_conversation") {
      findMember.mockResolvedValue({ userId: "user-1" })
      isWorkspaceAdminMember.mockReturnValue(true)
    }
    if ("followed" in action) {
      findBy.mockResolvedValue({
        ...(await findBy()),
        followed: action.followed,
      })
    }
    if (action.type === "remove_assignment") {
      findBy.mockResolvedValue({
        ...(await findBy()),
        assignedUserId: "user-1",
      })
    }
    const result = await executeAIAgentAction({
      action,
      context: {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        conversationId: "conversation-1",
        ruleId: "rule-1",
        triggerMessageId: "message-1",
        workspaceId: "workspace-1",
      },
      value: action.type === "set_custom_field" ? "value" : undefined,
    })
    expect(result).toMatchObject({ actionId: action.id, outcome: "executed" })
  })
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

  test("returns an operational failure without retrying the reply job", async () => {
    findBy.mockResolvedValue({ contactId: "contact-1" })
    findActiveById.mockResolvedValue({ currentVersionId: "version-1" })
    queueAdd.mockRejectedValueOnce(new Error("redis unavailable"))

    const result = await executeAIAgentAction({
      action: { id: "retry-flow", type: "send_flow", flowId: "flow-1" },
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
      actionId: "retry-flow",
      outcome: "failed",
      reason: "operation_failed",
    })
  })
})
