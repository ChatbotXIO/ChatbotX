import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateHandoverResumeFlow: vi.fn(),
  findActiveById: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    updateHandoverResumeFlow: mocks.updateHandoverResumeFlow,
  },
  whatsappSignupSessionRepository: {},
  metaCapiEventRepository: {},
  LIVE_RUN_STATUSES: [],
}))

vi.mock("../src/flow/service", () => ({
  flowService: { findActiveById: mocks.findActiveById },
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const target = { id: "iw-1", workspaceId: "ws-1" }

describe("integrationWhatsappService.updateHandoverResumeFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateHandoverResumeFlow.mockResolvedValue({ id: "iw-1" })
    mocks.findActiveById.mockResolvedValue({ id: "flow-1" })
  })

  test("stores an active flow of the same workspace", async () => {
    await integrationWhatsappService.updateHandoverResumeFlow({
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
      integrationWhatsappService.updateHandoverResumeFlow({
        ...target,
        handoverResumeFlowId: "flow-foreign",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.updateHandoverResumeFlow).not.toHaveBeenCalled()
  })

  test("clearing the flow skips the flow lookup", async () => {
    await integrationWhatsappService.updateHandoverResumeFlow({
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
      integrationWhatsappService.updateHandoverResumeFlow({
        ...target,
        handoverResumeFlowId: null,
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
