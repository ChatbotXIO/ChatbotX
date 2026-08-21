import { systemFieldTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  ConversationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

// These fields all delegate to a helper. The helper has its own tests, so what
// matters here is *which* helper each field calls and with which arguments —
// several fields share one helper and differ only by argument.
const mocks = vi.hoisted(() => ({
  getAssignedTeamName: vi.fn(),
  resolveAssigneeEmail: vi.fn(),
  resolveAssigneeId: vi.fn(),
  resolveAssigneeName: vi.fn(),
  listContactTagsString: vi.fn(),
  listContactNotesString: vi.fn(),
  getLatestContactNoteString: vi.fn(),
  getChatHistory: vi.fn(),
  getContactLastInput: vi.fn(),
  getContactLastInputType: vi.fn(),
  getQueuedMessages: vi.fn(),
}))

vi.mock("../src/helpers/assigned", () => ({
  getAssignedTeamName: mocks.getAssignedTeamName,
  resolveAssigneeEmail: mocks.resolveAssigneeEmail,
  resolveAssigneeId: mocks.resolveAssigneeId,
  resolveAssigneeName: mocks.resolveAssigneeName,
}))

vi.mock("../src/helpers/contact", () => ({
  listContactTagsString: mocks.listContactTagsString,
  listContactNotesString: mocks.listContactNotesString,
  getLatestContactNoteString: mocks.getLatestContactNoteString,
  findPrimaryContactChannel: vi.fn(),
}))

vi.mock("../src/helpers/message", () => ({
  getChatHistory: mocks.getChatHistory,
}))

vi.mock("../src/helpers/queued-messages", () => ({
  getQueuedMessages: mocks.getQueuedMessages,
}))

vi.mock("../src/helpers/last-input", () => ({
  getContactLastInput: mocks.getContactLastInput,
  getContactLastInputType: mocks.getContactLastInputType,
}))

vi.mock("../src/helpers/integration-fields", () => ({
  getIntegrationField: vi.fn(),
  getLastCommentedPostText: vi.fn(),
}))

vi.mock("../src/helpers/storage-url", () => ({
  toPublicStorageUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  appointmentService: { findBy: vi.fn() },
  conversationService: { findDMByContact: vi.fn() },
  messageService: { findById: vi.fn() },
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  resolveGenderLabel: vi.fn(),
}))

vi.mock("@chatbotx.io/encryption/keys", () => ({
  env: {
    ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}))

const { getSystemFieldValue } = await import("../src/utils")

const context = {
  contact: { id: "contact-1", workspaceId: "workspace-1" } as ContactModel,
  contactInbox: { id: "contact-inbox-1" } as ContactInboxModel,
  conversation: { id: "conversation-1" } as ConversationModel,
  workspace: { id: "workspace-1" } as WorkspaceModel,
}

describe("getSystemFieldValue — helper-backed fields", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("chat history variants differ only by limit and detail flag", async () => {
    mocks.getChatHistory.mockResolvedValue("transcript")

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.chat_history),
    ).resolves.toBe("transcript")
    expect(mocks.getChatHistory).toHaveBeenLastCalledWith("contact-1", 50)

    await getSystemFieldValue(context, systemFieldTypes.enum.chat_history_large)
    expect(mocks.getChatHistory).toHaveBeenLastCalledWith("contact-1", 200)

    await getSystemFieldValue(
      context,
      systemFieldTypes.enum.chat_history_details,
    )
    expect(mocks.getChatHistory).toHaveBeenLastCalledWith("contact-1", 50, true)

    await getSystemFieldValue(
      context,
      systemFieldTypes.enum.chat_history_details_large,
    )
    expect(mocks.getChatHistory).toHaveBeenLastCalledWith(
      "contact-1",
      200,
      true,
    )
  })

  test("ai queued messages delegates to its queued-message helper", async () => {
    mocks.getQueuedMessages.mockResolvedValue("first\nsecond")

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum["ai.queued.messages"]),
    ).resolves.toBe("first\nsecond")

    expect(mocks.getQueuedMessages).toHaveBeenCalledWith(context)
  })

  test("assigned admin fields resolve from the conversation assignee", async () => {
    mocks.resolveAssigneeName.mockResolvedValue("Ada")
    mocks.resolveAssigneeEmail.mockResolvedValue("ada@example.com")
    mocks.resolveAssigneeId.mockResolvedValue("admin-1")

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.assigned_admin_name),
    ).resolves.toBe("Ada")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.assigned_admin_email),
    ).resolves.toBe("ada@example.com")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.assigned_admin_id),
    ).resolves.toBe("admin-1")

    expect(mocks.resolveAssigneeName).toHaveBeenCalledWith(
      "contact-1",
      "workspace-1",
    )
    expect(mocks.resolveAssigneeEmail).toHaveBeenCalledWith(
      "contact-1",
      "workspace-1",
    )
    expect(mocks.resolveAssigneeId).toHaveBeenCalledWith(
      "contact-1",
      "workspace-1",
    )
  })

  test("member_name shares the assignee name resolver, team_name resolves by contact", async () => {
    mocks.resolveAssigneeName.mockResolvedValue("Grace")
    mocks.getAssignedTeamName.mockResolvedValue("Support")

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.member_name),
    ).resolves.toBe("Grace")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.team_name),
    ).resolves.toBe("Support")

    expect(mocks.resolveAssigneeName).toHaveBeenCalledWith(
      "contact-1",
      "workspace-1",
    )
    expect(mocks.getAssignedTeamName).toHaveBeenCalledWith("contact-1")
  })

  test("tag and note fields each call their own contact helper", async () => {
    mocks.listContactTagsString.mockResolvedValue("vip, lead")
    mocks.listContactNotesString.mockResolvedValue("note one\nnote two")
    mocks.getLatestContactNoteString.mockResolvedValue("note two")

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.user_tags),
    ).resolves.toBe("vip, lead")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.user_notes),
    ).resolves.toBe("note one\nnote two")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.last_user_note),
    ).resolves.toBe("note two")

    expect(mocks.listContactTagsString).toHaveBeenCalledWith("contact-1")
    expect(mocks.listContactNotesString).toHaveBeenCalledWith("contact-1")
    expect(mocks.getLatestContactNoteString).toHaveBeenCalledWith("contact-1")
  })

  test("last_input and last_input_type call separate helpers", async () => {
    mocks.getContactLastInput.mockResolvedValue("hello")
    mocks.getContactLastInputType.mockResolvedValue("text")

    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.last_input),
    ).resolves.toBe("hello")
    await expect(
      getSystemFieldValue(context, systemFieldTypes.enum.last_input_type),
    ).resolves.toBe("text")

    expect(mocks.getContactLastInput).toHaveBeenCalledWith("contact-1")
    expect(mocks.getContactLastInputType).toHaveBeenCalledWith("contact-1")
  })

  test("a null from any helper passes straight through", async () => {
    const nullable: [string, ReturnType<typeof vi.fn>][] = [
      [systemFieldTypes.enum.chat_history, mocks.getChatHistory],
      [systemFieldTypes.enum["ai.queued.messages"], mocks.getQueuedMessages],
      [systemFieldTypes.enum.user_tags, mocks.listContactTagsString],
      [systemFieldTypes.enum.user_notes, mocks.listContactNotesString],
      [systemFieldTypes.enum.last_user_note, mocks.getLatestContactNoteString],
      [systemFieldTypes.enum.member_name, mocks.resolveAssigneeName],
      [systemFieldTypes.enum.team_name, mocks.getAssignedTeamName],
      [systemFieldTypes.enum.assigned_admin_name, mocks.resolveAssigneeName],
      [systemFieldTypes.enum.assigned_admin_email, mocks.resolveAssigneeEmail],
      [systemFieldTypes.enum.assigned_admin_id, mocks.resolveAssigneeId],
      [systemFieldTypes.enum.last_input, mocks.getContactLastInput],
      [systemFieldTypes.enum.last_input_type, mocks.getContactLastInputType],
    ]

    for (const [key, helper] of nullable) {
      helper.mockResolvedValue(null)
      await expect(
        getSystemFieldValue(context, key as never),
        `${key} did not pass a null helper result through`,
      ).resolves.toBeNull()
    }
  })
})
