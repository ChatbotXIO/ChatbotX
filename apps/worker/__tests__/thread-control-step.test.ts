import { readFileSync } from "node:fs"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  type ThreadControlStepSchema,
  threadControlStepDefaultFn,
} from "@chatbotx.io/flow-config"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requestThreadControlAction: vi.fn(),
  resolveContactVariablesDeep: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  requestThreadControlAction: mocks.requestThreadControlAction,
}))

vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: mocks.resolveContactVariablesDeep,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {},
  contactService: {},
  conversationService: {},
  inboxTeamService: {},
  workspaceMemberService: {},
}))

vi.mock("@chatbotx.io/database/client", () => ({ gte: vi.fn() }))

vi.mock("@chatbotx.io/database/schema", () => ({ conversationModel: {} }))

vi.mock("../src/chat/handlers/send-message", () => ({
  resolveWhatsappMessageSourceId: vi.fn(),
  sendTypingToChannel: vi.fn(),
}))

vi.mock("../src/services/integrations", () => ({
  resolveIntegrationContextFromContactInbox: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: mocks.loggerWarn,
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

const { stepThreadControl } = await import(
  "../src/integration/handlers/step-handlers"
)

const conversation = { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" }
const contactInbox = { id: "ci-1", channel: "whatsapp" }

const props = (
  action: "release" | "pass",
  step: Partial<ThreadControlStepSchema> = {},
) =>
  ({
    conversation,
    contactInbox,
    step: threadControlStepDefaultFn({ action, ...step }),
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requestThreadControlAction.mockResolvedValue({})
  mocks.resolveContactVariablesDeep.mockImplementation(
    async (_contactId: string, value: { text: string }) => value,
  )
})

describe("stepThreadControl", () => {
  test.each([
    "release",
    "pass",
  ] as const)("%s calls the channel action for the step's contact inbox and follows the success path", async (action) => {
    const result = await stepThreadControl(props(action))

    expect(mocks.requestThreadControlAction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action,
    })
    expect(result).toMatchObject({ status: "success" })
  })

  test("a pass forwards the target role and the note with its variables resolved", async () => {
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      text: "Customer Ana wants a refund",
    })

    await stepThreadControl(
      props("pass", {
        targetRole: "customer_service",
        metadata: "Customer {{first_name}} wants a refund",
      }),
    )

    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledWith(
      "c-1",
      { text: "Customer {{first_name}} wants a refund" },
      { conversation, contactInbox },
    )
    expect(mocks.requestThreadControlAction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "pass",
      targetRole: "customer_service",
      metadata: "Customer Ana wants a refund",
    })
  })

  test("a pass without a note resolves no variables and sends no note", async () => {
    await stepThreadControl(props("pass", { targetRole: "marketing" }))

    expect(mocks.resolveContactVariablesDeep).not.toHaveBeenCalled()
    expect(mocks.requestThreadControlAction).toHaveBeenCalledWith(
      expect.objectContaining({ targetRole: "marketing", metadata: undefined }),
    )
  })

  test("a note that resolves to blank text is dropped", async () => {
    mocks.resolveContactVariablesDeep.mockResolvedValue({ text: "   " })

    await stepThreadControl(props("pass", { metadata: "{{empty_field}}" }))

    expect(mocks.requestThreadControlAction).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: undefined }),
    )
  })

  test("a release never forwards a stale target role or note", async () => {
    await stepThreadControl(
      props("release", { targetRole: "marketing", metadata: "old note" }),
    )

    expect(mocks.resolveContactVariablesDeep).not.toHaveBeenCalled()
    expect(mocks.requestThreadControlAction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
      action: "release",
    })
  })

  test("a variable lookup failure follows the error path without calling the channel", async () => {
    mocks.resolveContactVariablesDeep.mockRejectedValue(new Error("db down"))

    const result = await stepThreadControl(
      props("pass", { metadata: "{{first_name}}" }),
    )

    expect(result).toMatchObject({ status: "error", errorMessage: "db down" })
    expect(mocks.requestThreadControlAction).not.toHaveBeenCalled()
  })

  test("a channel refusal (e.g. the thread is not ours) follows the error path with the reason", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(
      new ChannelError("Not the owner", ChannelErrorCategory.PERMISSION_DENIED),
    )

    const result = await stepThreadControl(props("release"))

    expect(result).toMatchObject({
      status: "error",
      errorMessage: "Not the owner",
    })
  })

  test("an unsupported channel follows the error path", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(
      new ChatbotXException(
        "Conversation routing is not supported on the messenger channel",
        "threadControlUnsupported",
        400,
      ),
    )

    const result = await stepThreadControl(props("pass"))

    expect(result).toMatchObject({
      status: "error",
      errorMessage: expect.stringContaining("not supported"),
    })
  })

  test("an unexpected failure is logged and follows the error path instead of throwing into a retry", async () => {
    mocks.requestThreadControlAction.mockRejectedValue(new Error("db down"))

    const result = await stepThreadControl(props("release"))

    expect(result).toMatchObject({ status: "error", errorMessage: "db down" })
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })
})

describe("threadControl worker registration", () => {
  test("is dispatched by the flow step handler map and does not produce a message", () => {
    const step = readFileSync("src/integration/handlers/step.ts", "utf8")
    const utils = readFileSync("src/integration/handlers/flow-utils.ts", "utf8")

    expect(step).toContain("[stepTypes.enum.threadControl]: stepThreadControl")
    expect(utils).toContain("threadControl: false")
  })
})
