// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockCountByWorkspaceId, mockCreateDraft, mockGetTranslations } =
  vi.hoisted(() => ({
    mockCountByWorkspaceId: vi.fn().mockResolvedValue(0),
    mockCreateDraft: vi.fn(),
    mockGetTranslations: vi.fn().mockResolvedValue((k: string) => k),
  }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  webhookService: {
    countByWorkspaceId: mockCountByWorkspaceId,
    createDraft: mockCreateDraft,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("next-intl/server", () => ({
  getTranslations: mockGetTranslations,
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("../src/features/webhooks/schema/create-webhook-schema", () => ({
  createWebhookSchema: {},
}))

vi.mock("../src/features/webhooks/constants", () => ({
  MAX_WEBHOOKS_PER_CHATBOT: 100,
}))

const { createWebhookAction } = await import(
  "../src/features/webhooks/actions/create-webhook-action"
)

type Handler = (args: {
  bindArgsParsedInputs: [string]
  parsedInput: { name: string; folderId?: string | null }
}) => Promise<unknown>

const callAction = createWebhookAction as unknown as Handler

beforeEach(() => {
  vi.clearAllMocks()
  mockCountByWorkspaceId.mockResolvedValue(0)
  mockGetTranslations.mockResolvedValue((k: string) => k)
})

describe("createWebhookAction", () => {
  test("delegates to webhookService.createDraft and returns its result", async () => {
    mockCreateDraft.mockResolvedValue({ id: "webhook-1", name: "New Order" })

    const result = await callAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "New Order", folderId: null },
    })

    expect(result).toEqual({ id: "webhook-1", name: "New Order" })
    expect(mockCreateDraft).toHaveBeenCalledWith({
      name: "New Order",
      folderId: null,
      workspaceId: "ws-1",
    })
  })

  test("throws the i18n limit message once the workspace has reached MAX_WEBHOOKS_PER_CHATBOT", async () => {
    mockCountByWorkspaceId.mockResolvedValue(100)

    await expect(
      callAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { name: "New Order" },
      }),
    ).rejects.toThrow("validation.maxItemsReached")

    expect(mockCreateDraft).not.toHaveBeenCalled()
  })
})
