// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockSubscribePageLeadgen = vi.fn()
vi.mock("@/features/facebook-lead-ad-automation/lib/pages", () => ({
  subscribePageLeadgen: mockSubscribePageLeadgen,
}))

const mockCreate = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  facebookLeadAdsAutomationService: { create: mockCreate },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code = "systemError"
    httpStatusCode = 400
  },
}))

const mockLoggerError = vi.fn()
vi.mock("@/lib/log", () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}))

const { createLeadAdAutomation } = await import(
  "@/features/facebook-lead-ad-automation/lib/create-automation"
)

const messages = {
  subscribeError: "Failed to subscribe the page to lead webhooks.",
  duplicateError: "An automation for this page and form already exists.",
}

const data = {
  name: "Newsletter leads",
  pageId: "page-1",
  formId: "form-1",
  fieldMapping: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createLeadAdAutomation", () => {
  test("subscribes the page to leadgen before persisting the automation", async () => {
    mockSubscribePageLeadgen.mockResolvedValueOnce(undefined)
    mockCreate.mockResolvedValueOnce({ id: "lead-ad-1" })

    const result = await createLeadAdAutomation({
      workspaceId: "workspace-1",
      data,
      messages,
    })

    expect(result).toEqual({ id: "lead-ad-1" })
    expect(mockSubscribePageLeadgen).toHaveBeenCalledWith(
      "workspace-1",
      "page-1",
    )
    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "Newsletter leads",
      pageId: "page-1",
      pageName: null,
      formId: "form-1",
      formName: null,
      fieldMapping: [],
      flowId: null,
      duplicateMessage: messages.duplicateError,
    })
  })

  test("never persists the automation when the leadgen subscription fails", async () => {
    mockSubscribePageLeadgen.mockRejectedValueOnce(
      new Error("Meta API unavailable"),
    )

    await expect(
      createLeadAdAutomation({ workspaceId: "workspace-1", data, messages }),
    ).rejects.toThrow(messages.subscribeError)

    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        pageId: "page-1",
      }),
      expect.any(String),
    )
  })
})
