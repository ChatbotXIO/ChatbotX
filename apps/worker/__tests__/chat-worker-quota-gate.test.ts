import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  ensureBootstrapped: vi.fn(),
  isBlockedWorkspace: vi.fn(),
  isBotMessageQuotaReached: vi.fn(),
  processJob: undefined as undefined | ((job: unknown) => Promise<void>),
  resolveWorkspaceId: vi.fn(),
  sendFlowStep: vi.fn(),
  sendMessageToChannel: vi.fn(),
  sendTypingToChannel: vi.fn(),
}))

vi.mock("@chatbotx.io/automated-response", () => ({
  replyByOutboundAutomatedResponse: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  broadcastToWorkspaceParty: vi.fn(),
}))
vi.mock("@chatbotx.io/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/sdk")>()
  return {
    ...actual,
    SdkException: class SdkException extends Error {},
  }
})
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return {
    ...actual,
    ChatJobAction: {
      sendChannelMessage: "sendChannelMessage",
      sendFlowMessage: "sendFlowMessage",
      sendChatMessage: "sendChatMessage",
      sendWhatsappTemplateMessage: "sendWhatsappTemplateMessage",
      sendMessengerTemplateMessage: "sendMessengerTemplateMessage",
      sendTyping: "sendTyping",
      notifyExportResult: "notifyExportResult",
      broadcastEvent: "broadcastEvent",
      deleteChannelMessage: "deleteChannelMessage",
      editChannelMessage: "editChannelMessage",
      changeChannelMessageState: "changeChannelMessageState",
    },
    defaultWorkerOptions: {},
    getRedisConnection: vi.fn(),
    queueNames: { enum: { chat: "chat" } },
  }
})
vi.mock("bullmq", () => ({
  Worker: class Worker {
    constructor(_queue: string, processJob: (job: unknown) => Promise<void>) {
      mocks.processJob = processJob
    }

    on() {
      // Worker event registration is not exercised by this unit test.
    }

    close() {
      return Promise.resolve()
    }
  },
  // Instantiated at module scope by worker-config's queue setup; not
  // exercised by this unit test beyond needing to construct successfully.
  Queue: class Queue {
    add() {
      return Promise.resolve()
    }
  },
}))
vi.mock("../src/lib/bootstrap", () => ({
  ensureBootstrapped: mocks.ensureBootstrapped,
}))
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: mocks.isBlockedWorkspace,
}))
vi.mock("../src/lib/is-bot-message-quota-reached", () => ({
  isBotMessageQuotaReached: mocks.isBotMessageQuotaReached,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/lib/resolve-workspace-id", () => ({
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}))
vi.mock("../src/chat/handlers/send-flow-step", () => ({
  sendChatMessage: vi.fn(),
  sendFlowStep: mocks.sendFlowStep,
}))
vi.mock("../src/chat/handlers/send-message", () => ({
  changeMessageStateOnChannel: vi.fn(),
  deleteMessageFromChannel: vi.fn(),
  editMessageFromChannel: vi.fn(),
  sendMessageToChannel: mocks.sendMessageToChannel,
  sendTypingToChannel: mocks.sendTypingToChannel,
}))
vi.mock("../src/chat/handlers/send-messenger-template", () => ({
  sendMessengerTemplateMessage: vi.fn(),
}))
vi.mock("../src/chat/handlers/send-whatsapp-template", () => ({
  sendWhatsappTemplateMessage: vi.fn(),
}))

beforeAll(async () => {
  mocks.ensureBootstrapped.mockResolvedValue(undefined)
  await import("../src/chat/worker")
  await vi.waitFor(() => expect(mocks.processJob).toBeTypeOf("function"))
  // `src/chat/worker` pulls in many largely-unmocked handler modules; the
  // one-time esbuild transform on this first import can exceed the default
  // 10s hook timeout under CPU contention (e.g. `turbo run test` fanning out
  // across the whole monorepo).
}, 60_000)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isBlockedWorkspace.mockResolvedValue(false)
  mocks.isBotMessageQuotaReached.mockResolvedValue(false)
  mocks.resolveWorkspaceId.mockResolvedValue("workspace-1")
})

describe("chat worker bot message quota gate", () => {
  test("does not invoke a bot-send handler when the quota is reached", async () => {
    mocks.isBotMessageQuotaReached.mockResolvedValue(true)

    await mocks.processJob?.({
      id: "job-1",
      data: { type: "sendFlowMessage", data: {} },
    })

    expect(mocks.sendFlowStep).not.toHaveBeenCalled()
  })

  test("invokes a bot-send handler below the quota", async () => {
    await mocks.processJob?.({
      id: "job-1",
      data: { type: "sendFlowMessage", data: {} },
    })

    expect(mocks.sendFlowStep).toHaveBeenCalledOnce()
  })

  test("leaves non-bot-send actions unaffected", async () => {
    await mocks.processJob?.({
      id: "job-1",
      data: { type: "sendTyping", data: {} },
    })

    expect(mocks.isBotMessageQuotaReached).not.toHaveBeenCalled()
    expect(mocks.sendTypingToChannel).toHaveBeenCalledOnce()
  })

  test("does not invoke a bot channel-message handler when the quota is reached", async () => {
    mocks.isBotMessageQuotaReached.mockResolvedValue(true)

    await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "sendChannelMessage",
        data: { message: { senderType: "bot" } },
      },
    })

    expect(mocks.sendMessageToChannel).not.toHaveBeenCalled()
  })

  test("invokes a user channel-message handler even when the quota is reached", async () => {
    mocks.isBotMessageQuotaReached.mockResolvedValue(true)

    await mocks.processJob?.({
      id: "job-1",
      data: {
        type: "sendChannelMessage",
        data: { message: { senderType: "user" } },
      },
    })

    expect(mocks.isBotMessageQuotaReached).not.toHaveBeenCalled()
    expect(mocks.sendMessageToChannel).toHaveBeenCalledOnce()
  })
})
