import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockEmit,
  mockEvaluateInboundMessage,
  mockFindEnabledForWorkspace,
  mockIntegrationQueueAdd,
  mockLogProviderError,
  mockResolveRoute,
  mockRunExclusive,
  mockWriteMetadata,
  mockHandoffExecute,
  mockFindActiveFlow,
  mockFindAgent,
  mockListOnShiftUserIds,
} = vi.hoisted(() => ({
  mockEmit: vi.fn(),
  mockEvaluateInboundMessage: vi.fn(),
  mockFindEnabledForWorkspace: vi.fn(),
  mockIntegrationQueueAdd: vi.fn(),
  mockLogProviderError: vi.fn(),
  mockResolveRoute: vi.fn(),
  mockRunExclusive: vi.fn(),
  mockWriteMetadata: vi.fn(),
  mockHandoffExecute: vi.fn(),
  mockFindActiveFlow: vi.fn(),
  mockFindAgent: vi.fn(),
  mockListOnShiftUserIds: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiTimeouts: { aiTotal: 30_000 },
}))

vi.mock("@chatbotx.io/business", () => ({
  aiAgentService: { findByIdForWorkspace: mockFindAgent },
  conversationService: { claimAssignmentIfUnassigned: vi.fn() },
  decisionEvaluationService: {
    evaluateInboundMessage: mockEvaluateInboundMessage,
  },
  flowService: { findActiveById: mockFindActiveFlow },
  globalRouterService: {
    findEnabledForWorkspace: mockFindEnabledForWorkspace,
    resolveRoute: mockResolveRoute,
    writeMetadata: mockWriteMetadata,
  },
  inboxTeamService: { exists: vi.fn() },
  logProviderErrorForChannel: mockLogProviderError,
  isUserOnShift: async (props: {
    workspaceId: string
    userId: string
    at?: Date
  }) =>
    (
      await mockListOnShiftUserIds({
        workspaceId: props.workspaceId,
        userIds: [props.userId],
        at: props.at,
      })
    ).has(props.userId),
  workspaceMemberService: { findMembership: vi.fn() },
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: mockEmit }))
vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: () => "webhook",
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mockRunExclusive },
  isLockAcquisitionError: () => false,
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}))
vi.mock("../src/trigger/services/handoff-executor.service", () => ({
  handoffExecutorService: { execute: mockHandoffExecute },
}))
vi.mock("../src/integration/handlers/automated-response/replies", () => ({
  replyByAI: vi.fn(),
}))
vi.mock(
  "../src/integration/handlers/automated-response/run-agent-reply",
  () => ({ runAgentReply: vi.fn() }),
)

const {
  isGlobalRouterEligibleMessage,
  runGlobalRouter,
  shouldStopAutomatedResponseAfterGlobalRouter,
  shouldRunGlobalRouterAfterAutomatedResponse,
} = await import("../src/integration/handlers/automated-response/global-router")

const routerInput = {
  contactId: "contact-1",
  contactInbox: { channel: "webchat", id: "contact-inbox-1" },
  contactInboxId: "contact-inbox-1",
  conversation: { id: "conversation-1", workspaceId: "workspace-1" },
  conversationId: "conversation-1",
  defaultReplyFrequency: "allTime",
  messageId: "message-1",
  senderType: "contact",
  text: "private inbound text",
  workspace: { timezone: "Asia/Ho_Chi_Minh" },
  workspaceId: "workspace-1",
}

describe("Global Router worker boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRunExclusive.mockImplementation(async ({ fn }) => fn())
    mockListOnShiftUserIds.mockImplementation(
      async ({ userIds }: { userIds: string[] }) => new Set(userIds),
    )
  })

  test("only accepts latest contact text containing a letter or number", () => {
    expect(
      isGlobalRouterEligibleMessage({ senderType: "contact", text: "giá?" }),
    ).toBe(true)
    expect(
      isGlobalRouterEligibleMessage({ senderType: "contact", text: "👍" }),
    ).toBe(false)
    expect(
      isGlobalRouterEligibleMessage({ senderType: "bot", text: "help" }),
    ).toBe(false)
    expect(isGlobalRouterEligibleMessage({ text: "   " })).toBe(false)
  })

  test("runs after an empty Keyword queue but not after a handled Keyword", () => {
    expect(
      shouldRunGlobalRouterAfterAutomatedResponse({
        status: "noEligibleMessage",
      }),
    ).toBe(true)
    expect(
      shouldRunGlobalRouterAfterAutomatedResponse({ status: "noMatch" }),
    ).toBe(true)
    expect(
      shouldRunGlobalRouterAfterAutomatedResponse({ status: "handled" }),
    ).toBe(false)
  })

  test("lets the legacy default path handle an unavailable destination", () => {
    expect(shouldStopAutomatedResponseAfterGlobalRouter("unavailable")).toBe(
      false,
    )
    expect(shouldStopAutomatedResponseAfterGlobalRouter("success")).toBe(true)
    expect(shouldStopAutomatedResponseAfterGlobalRouter("contention")).toBe(
      true,
    )
  })

  test("returns to legacy for an invalid router while recording redacted analytics", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      reason: "configInvalid",
      status: "invalid",
    })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe("invalid")

    expect(mockLogProviderError).toHaveBeenCalledWith(
      "webchat",
      expect.objectContaining({
        contactId: "contact-1",
        workspaceId: "workspace-1",
      }),
    )
    expect(mockEmit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        metadata: expect.objectContaining({
          fallbackReason: "global_router_config_invalid",
        }),
      }),
    )
    expect(JSON.stringify(mockEmit.mock.calls)).not.toContain(
      "private inbound text",
    )
  })

  test("returns unavailable when the mandatory fallback is stale", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: { fallback: { id: "flow-1", type: "flow" } },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({ status: "thresholdUnmet" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe(
      "unavailable",
    )

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
    // The caller will now enter the legacy default path because no router
    // destination was dispatched.
    expect(mockEmit).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        metadata: expect.objectContaining({
          fallbackReason: "global_router_fallback_failed",
        }),
      }),
    )
  })

  test("propagates retryable failures before an AI response is confirmed", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: { fallback: { id: "agent-1", type: "aiAgent" } },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({ status: "thresholdUnmet" })
    mockFindAgent.mockResolvedValue({ id: "agent-1" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe(
      "retryableFailure",
    )
  })

  test("queues the selected Flow route with a deterministic primary job id", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: {
        fallback: { id: "fallback-flow", type: "flow" },
        routes: [
          {
            destination: { id: "primary-flow", type: "flow" },
            type: "choice",
            value: "route_to_flow",
          },
        ],
      },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({
      answer: { choice: "route_to_flow", confidence: 1, type: "choice" },
      status: "answer",
    })
    mockResolveRoute.mockReturnValue({
      destination: { id: "primary-flow", type: "flow" },
    })
    mockWriteMetadata.mockResolvedValue({ status: "skipped" })
    mockFindActiveFlow.mockResolvedValue({ currentVersionId: "version-1" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe("success")

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ flowId: "primary-flow" }),
      }),
      expect.objectContaining({
        jobId: "global-router-flow-contact-inbox-1-message-1",
      }),
    )
  })

  test("queues the mandatory fallback Flow when a choice has no route", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: { fallback: { id: "fallback-flow", type: "flow" }, routes: [] },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({
      answer: { choice: "other", confidence: 1, type: "choice" },
      status: "answer",
    })
    mockResolveRoute.mockReturnValue({ destination: null })
    mockWriteMetadata.mockResolvedValue({ status: "skipped" })
    mockFindActiveFlow.mockResolvedValue({ currentVersionId: "version-1" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe("success")

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ flowId: "fallback-flow" }),
      }),
      expect.objectContaining({
        jobId: "global-router-flow-contact-inbox-1-message-1-fallback",
      }),
    )
  })

  test("uses the fallback Flow when metadata persistence fails", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: {
        fallback: { id: "fallback-flow", type: "flow" },
        routes: [
          {
            destination: { id: "primary-flow", type: "flow" },
            type: "choice",
            value: "route_to_flow",
          },
        ],
      },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({
      answer: { choice: "route_to_flow", confidence: 1, type: "choice" },
      status: "answer",
    })
    mockResolveRoute.mockReturnValue({
      destination: { id: "primary-flow", type: "flow" },
    })
    mockWriteMetadata.mockResolvedValue({ status: "failed" })
    mockFindActiveFlow.mockResolvedValue({ currentVersionId: "version-1" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe("success")

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ flowId: "fallback-flow" }),
      }),
      expect.objectContaining({
        jobId: "global-router-flow-contact-inbox-1-message-1-fallback",
      }),
    )
  })

  test("uses the fallback Flow when the selected Flow is no longer active", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: {
        fallback: { id: "fallback-flow", type: "flow" },
        routes: [
          {
            destination: { id: "primary-flow", type: "flow" },
            type: "choice",
            value: "route_to_flow",
          },
        ],
      },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({
      answer: { choice: "route_to_flow", confidence: 1, type: "choice" },
      status: "answer",
    })
    mockResolveRoute.mockReturnValue({
      destination: { id: "primary-flow", type: "flow" },
    })
    mockWriteMetadata.mockResolvedValue({ status: "skipped" })
    mockFindActiveFlow
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ currentVersionId: "version-1" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe("success")

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "sendFlow",
      expect.objectContaining({
        data: expect.objectContaining({ flowId: "fallback-flow" }),
      }),
      expect.objectContaining({
        jobId: "global-router-flow-contact-inbox-1-message-1-fallback",
      }),
    )
  })

  test("returns contention without dispatching a second destination", async () => {
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: { fallback: { id: "fallback-flow", type: "flow" } },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({ status: "contention" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe(
      "contention",
    )

    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  test("passes the source channel to human handoff analytics", async () => {
    const business = await import("@chatbotx.io/business")
    vi.mocked(business.workspaceMemberService.findMembership).mockResolvedValue(
      {} as never,
    )
    mockHandoffExecute.mockResolvedValue({ status: "handedOff" })
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: {
        fallback: { id: "user-1", type: "user" },
        routes: [
          {
            destination: { id: "user-1", type: "user" },
            type: "choice",
            value: "buy",
          },
        ],
      },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({
      answer: { choice: "buy", confidence: 1, type: "choice" },
      status: "answer",
    })
    mockResolveRoute.mockReturnValue({
      destination: { id: "user-1", type: "user" },
    })
    mockWriteMetadata.mockResolvedValue({ status: "skipped" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe(
      "terminal",
    )

    expect(mockHandoffExecute).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "webchat" }),
    )
  })
  test("routes to the fallback without a handoff when the user destination is off shift", async () => {
    const business = await import("@chatbotx.io/business")
    vi.mocked(business.workspaceMemberService.findMembership).mockResolvedValue(
      {} as never,
    )
    mockListOnShiftUserIds.mockResolvedValue(new Set())
    mockFindActiveFlow.mockResolvedValue({ currentVersionId: "version-1" })
    mockFindEnabledForWorkspace.mockResolvedValue({
      config: {
        fallback: { id: "fallback-flow", type: "flow" },
        routes: [
          {
            destination: { id: "user-1", type: "user" },
            type: "choice",
            value: "buy",
          },
        ],
      },
      connection: {},
      profile: { id: "profile-1" },
      status: "usable",
    })
    mockEvaluateInboundMessage.mockResolvedValue({
      answer: { choice: "buy", confidence: 1, type: "choice" },
      status: "answer",
    })
    mockResolveRoute.mockReturnValue({
      destination: { id: "user-1", type: "user" },
    })
    mockWriteMetadata.mockResolvedValue({ status: "skipped" })

    await expect(runGlobalRouter(routerInput as never)).resolves.toBe("success")

    expect(mockHandoffExecute).not.toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).toHaveBeenCalledTimes(1)
  })
})
