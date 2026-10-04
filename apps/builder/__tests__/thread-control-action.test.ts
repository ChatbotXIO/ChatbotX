// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  ChannelError,
  ChannelErrorCategory,
  ThreadControlTakeRefusedError,
} from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByOrFail: vi.fn(),
  requestConversationThreadControl: vi.fn(),
  requireContactAccessForMember: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const { ChatbotXException: BaseException } = await import(
    "@chatbotx.io/business/errors"
  )
  class ThreadControlUnsupportedError extends BaseException {
    constructor(channel: string) {
      super(`unsupported ${channel}`, "threadControlUnsupported", 400)
    }
  }
  return {
    conversationService: { findByOrFail: mocks.findByOrFail },
    ThreadControlUnsupportedError,
  }
})

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  requestConversationThreadControl: mocks.requestConversationThreadControl,
}))

vi.mock("@/features/contacts/permissions", () => ({
  requireContactAccessForMember: mocks.requireContactAccessForMember,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

const { threadControlAction: untypedAction } = await import(
  "../src/features/conversations/actions/thread-control.action"
)
const { ThreadControlUnsupportedError } = await import("@chatbotx.io/business")
const threadControlAction = untypedAction as unknown as (props: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { contactInboxId: string; action: "take" | "release" | "pass" }
  ctx: { user: { id: string }; workspaceMemberPermissions: unknown }
}) => Promise<unknown>

const NOT_THE_OWNER_PATTERN = /Not the owner/
const permissions = { onlyAssignedContacts: true }
const run = (action: "take" | "release" | "pass", contactInboxId = "ci-1") =>
  threadControlAction({
    bindArgsParsedInputs: ["ws-1", "conv-1"],
    parsedInput: { contactInboxId, action },
    ctx: { user: { id: "user-1" }, workspaceMemberPermissions: permissions },
  })

const snapshot = {
  contactInboxId: "ci-1",
  threadControlState: "owned",
  threadOwnerRole: "escalation",
  threadControlUpdatedAt: new Date("2026-09-29T10:00:00.000Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByOrFail.mockResolvedValue({ id: "conv-1", contactId: "contact-1" })
  mocks.requireContactAccessForMember.mockResolvedValue({})
  mocks.requestConversationThreadControl.mockResolvedValue(snapshot)
})

describe("threadControlAction", () => {
  test("checks the caller's contact scope, then runs the action through the channel registry", async () => {
    await expect(run("take")).resolves.toEqual({ status: "applied", snapshot })

    expect(mocks.findByOrFail).toHaveBeenCalledWith({
      where: { id: "conv-1", workspaceId: "ws-1" },
    })
    expect(mocks.requireContactAccessForMember).toHaveBeenCalledWith({
      permissions,
      userId: "user-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(mocks.requestConversationThreadControl).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation: { id: "conv-1", contactId: "contact-1" },
      contactInboxId: "ci-1",
      action: "take",
    })
  })

  test("refuses a caller outside the contact's scope without touching the channel", async () => {
    mocks.requireContactAccessForMember.mockRejectedValue(
      new ChatbotXException("Contact not found", "notFound", 404),
    )

    await expect(run("release")).rejects.toThrow("Contact not found")
    expect(mocks.requestConversationThreadControl).not.toHaveBeenCalled()
  })

  test("shows a translated not-found for a contact inbox of another contact", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ChatbotXException("Contact inbox not found", "notFound", 404),
    )

    await expect(run("release", "ci-foreign")).rejects.toThrow(
      "conversationRouting.errors.notFound",
    )
  })

  test("returns the inline refusal when the channel refuses a take (not escalation)", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ThreadControlTakeRefusedError(
        "(#2494191) Only escalation may take",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 2_494_191 },
      ),
    )

    await expect(run("take")).resolves.toEqual({ status: "notEscalation" })
  })

  test("surfaces any other permission-denied take as an error, not the inline refusal", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ChannelError(
        "(#10) Not the owner",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 10 },
      ),
    )

    await expect(run("take")).rejects.toThrow(NOT_THE_OWNER_PATTERN)
  })

  test("surfaces a permission-denied release as an error, not the take refusal", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ChannelError(
        "(#10) Not the owner",
        ChannelErrorCategory.PERMISSION_DENIED,
        { code: 10 },
      ),
    )

    await expect(run("release")).rejects.toThrow(NOT_THE_OWNER_PATTERN)
  })

  test("maps an unsupported channel to a translated error", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ThreadControlUnsupportedError("messenger"),
    )

    await expect(run("pass")).rejects.toThrow(
      "conversationRouting.errors.unsupported",
    )
  })

  test("falls back to the generic message for a channel error without text", async () => {
    mocks.requestConversationThreadControl.mockRejectedValue(
      new ChannelError("", ChannelErrorCategory.NETWORK_ERROR),
    )

    await expect(run("pass")).rejects.toThrow(
      "conversationRouting.errors.actionFailed",
    )
  })

  test("rethrows an unexpected error unchanged", async () => {
    const boom = new Error("database down")
    mocks.requestConversationThreadControl.mockRejectedValue(boom)

    await expect(run("take")).rejects.toBe(boom)
  })
})
