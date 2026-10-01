// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  updateHandoverResumeFlow: vi.fn(),
  assertWorkspaceSuperAdmin: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    updateHandoverResumeFlow: mocks.updateHandoverResumeFlow,
  },
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
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

const { updateHandoverResumeFlowAction: untypedAction } = await import(
  "../src/features/integration-messenger/actions/update-handover-resume-flow.action"
)
const updateHandoverResumeFlowAction = untypedAction as unknown as (props: {
  bindArgsParsedInputs: [string, string]
  parsedInput: { handoverResumeFlowId: string | null }
}) => Promise<unknown>

const run = (handoverResumeFlowId: string | null) =>
  updateHandoverResumeFlowAction({
    bindArgsParsedInputs: ["ws-1", "im-1"],
    parsedInput: { handoverResumeFlowId },
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.updateHandoverResumeFlow.mockResolvedValue(undefined)
})

describe("updateHandoverResumeFlowAction", () => {
  test("saves the flow for the bound workspace and number", async () => {
    await expect(run("flow-1")).resolves.toEqual({
      handoverResumeFlowId: "flow-1",
    })
    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.updateHandoverResumeFlow).toHaveBeenCalledWith({
      id: "im-1",
      workspaceId: "ws-1",
      handoverResumeFlowId: "flow-1",
    })
  })

  test("clears the flow with null", async () => {
    await expect(run(null)).resolves.toEqual({ handoverResumeFlowId: null })
    expect(mocks.updateHandoverResumeFlow).toHaveBeenCalledWith(
      expect.objectContaining({ handoverResumeFlowId: null }),
    )
  })

  test("refuses a non super admin before any write", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValue(
      new ChatbotXException("errors.superAdminRequired"),
    )

    await expect(run("flow-1")).rejects.toThrow("errors.superAdminRequired")
    expect(mocks.updateHandoverResumeFlow).not.toHaveBeenCalled()
  })

  test("maps a missing or inactive flow to a translated error", async () => {
    mocks.updateHandoverResumeFlow.mockRejectedValue(
      new ChatbotXException("Handover flow not found", "notFound", 404),
    )

    await expect(run("flow-x")).rejects.toThrow(
      "conversationRouting.settings.flowNotFound",
    )
  })

  test("maps a missing number on clear to a translated error", async () => {
    mocks.updateHandoverResumeFlow.mockRejectedValue(
      new ChatbotXException("Messenger integration not found", "notFound", 404),
    )

    await expect(run(null)).rejects.toThrow(
      "conversationRouting.settings.messengerIntegrationNotFound",
    )
  })

  test("rethrows any other failure unchanged", async () => {
    const boom = new Error("database down")
    mocks.updateHandoverResumeFlow.mockRejectedValue(boom)

    await expect(run("flow-1")).rejects.toBe(boom)
  })
})
