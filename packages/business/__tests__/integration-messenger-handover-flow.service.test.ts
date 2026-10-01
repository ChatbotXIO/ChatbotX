import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateHandoverResumeFlow: vi.fn(),
  findActiveById: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationMessengerRepository: {
    updateHandoverResumeFlow: mocks.updateHandoverResumeFlow,
  },
}))

vi.mock("../src/flow/service", () => ({
  flowService: { findActiveById: mocks.findActiveById },
}))

vi.mock("../src/inbox/connect-channel", () => ({
  auditChannelConnected: vi.fn(),
  connectChannelIntegration: vi.fn(),
  runConnectTransaction: vi.fn(),
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {},
}))

const { messengerIntegrationService } = await import(
  "../src/integration-messenger/service"
)

const target = { id: "im-1", workspaceId: "ws-1" }

describe("messengerIntegrationService.updateHandoverResumeFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateHandoverResumeFlow.mockResolvedValue({ id: "im-1" })
    mocks.findActiveById.mockResolvedValue({ id: "flow-1" })
  })

  test("stores an active flow of the same workspace", async () => {
    await messengerIntegrationService.updateHandoverResumeFlow({
      ...target,
      handoverResumeFlowId: "flow-1",
    })

    expect(mocks.findActiveById).toHaveBeenCalledWith({
      id: "flow-1",
      workspaceId: "ws-1",
    })
    expect(mocks.updateHandoverResumeFlow).toHaveBeenCalledWith({
      ...target,
      handoverResumeFlowId: "flow-1",
    })
  })

  test("refuses a flow that is missing, inactive or from another workspace and writes nothing", async () => {
    mocks.findActiveById.mockResolvedValue(undefined)

    await expect(
      messengerIntegrationService.updateHandoverResumeFlow({
        ...target,
        handoverResumeFlowId: "flow-foreign",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.updateHandoverResumeFlow).not.toHaveBeenCalled()
  })

  test("clearing the flow skips the flow lookup", async () => {
    await messengerIntegrationService.updateHandoverResumeFlow({
      ...target,
      handoverResumeFlowId: null,
    })

    expect(mocks.findActiveById).not.toHaveBeenCalled()
    expect(mocks.updateHandoverResumeFlow).toHaveBeenCalledWith({
      ...target,
      handoverResumeFlowId: null,
    })
  })

  test("an integration outside the workspace is not found", async () => {
    mocks.updateHandoverResumeFlow.mockResolvedValue(null)

    await expect(
      messengerIntegrationService.updateHandoverResumeFlow({
        ...target,
        handoverResumeFlowId: null,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
