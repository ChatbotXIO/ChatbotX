// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(),
  findIntegrationInstagram: vi.fn(),
  transaction: vi.fn(
    async (callback: (tx: Record<string, never>) => Promise<void>) =>
      callback({}),
  ),
  updateMarkReadOnOutbound: vi.fn(),
  updateProfileFields: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  inboxService: {
    updateMarkReadOnOutbound: mocks.updateMarkReadOnOutbound,
  },
  instagramIntegrationService: {
    updateProfileFields: mocks.updateProfileFields,
  },
}))

vi.mock("@chatbotx.io/business/branding", () => ({
  moveBrandingMenuLast: vi.fn((menus: unknown[]) => menus),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowVersionModel: {},
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  encodeButtonPayload: vi.fn(),
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  integration: { runChannelHandler: vi.fn() },
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  integration: { runChannelHandler: vi.fn() },
}))

vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn() },
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
})

vi.mock("../src/features/integration-instagram/queries", () => ({
  findIntegrationInstagram: mocks.findIntegrationInstagram,
}))

const { updateInstagramAction } = await import(
  "../src/features/integration-instagram/actions/update-instagram-action"
)

const makeInput = (markReadOnOutbound?: boolean) => ({
  bindArgsParsedInputs: ["workspace-1", "instagram-1"],
  ctx: { workspace: { id: "workspace-1" } },
  parsedInput: {
    welcomeFlowId: null,
    conversationStarters: [],
    persistentMenus: [],
    ...(markReadOnOutbound === undefined ? {} : { markReadOnOutbound }),
  },
})

describe("updateInstagramAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findIntegrationInstagram.mockResolvedValue({
      id: "instagram-1",
      inboxId: "inbox-1",
      type: "instagram",
      auth: {},
    })
    mocks.buildContext.mockResolvedValue({
      platform: { appUrl: "https://app.example.test" },
    })
  })

  test("updates the inbox flag after saving the Instagram integration", async () => {
    await (updateInstagramAction as (props: unknown) => Promise<unknown>)(
      makeInput(true),
    )

    expect(mocks.updateMarkReadOnOutbound).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "inbox-1",
      enabled: true,
    })
  })

  test("does not update the inbox flag when the field is omitted", async () => {
    await (updateInstagramAction as (props: unknown) => Promise<unknown>)(
      makeInput(),
    )

    expect(mocks.updateMarkReadOnOutbound).not.toHaveBeenCalled()
  })
})
