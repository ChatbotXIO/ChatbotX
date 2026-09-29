// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string, string]
}) => Promise<unknown>

const {
  assertWorkspaceSuperAdminMock,
  findWorkspaceByIdMock,
  findByIdForWorkspaceMock,
  resolveForOwnerMock,
  resolveOwnerForWorkspaceMock,
  ensureWhatsappCallsWebhookSubscribedMock,
} = vi.hoisted(() => ({
  assertWorkspaceSuperAdminMock: vi.fn(async () => undefined),
  findWorkspaceByIdMock: vi.fn(),
  findByIdForWorkspaceMock: vi.fn(),
  resolveForOwnerMock: vi.fn(),
  resolveOwnerForWorkspaceMock: vi.fn(async () => "owner-1"),
  ensureWhatsappCallsWebhookSubscribedMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (handler: unknown) => handler
  return { callingAdminActionClient: chain }
})

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: assertWorkspaceSuperAdminMock,
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: resolveOwnerForWorkspaceMock,
}))

vi.mock(
  "@/features/integration-whatsapp/libs/ensure-calls-webhook-subscribed",
  () => ({
    ensureWhatsappCallsWebhookSubscribed:
      ensureWhatsappCallsWebhookSubscribedMock,
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { findById: findWorkspaceByIdMock },
  integrationWhatsappService: {
    findByIdForWorkspace: findByIdForWorkspaceMock,
  },
  platformCredentialService: { resolveForOwner: resolveForOwnerMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { fixWhatsappCallsSubscriptionAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/fix-whatsapp-calls-subscription.action"
)
const action = fixWhatsappCallsSubscriptionAction as unknown as ActionHandler

const call = () =>
  action({ bindArgsParsedInputs: ["workspace-1", "integration-1"] })

describe("fixWhatsappCallsSubscriptionAction — callingAdminActionClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    assertWorkspaceSuperAdminMock.mockResolvedValue(undefined)
    findWorkspaceByIdMock.mockResolvedValue({ id: "workspace-1" })
    findByIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { metadata: { isManual: false } },
    })
    resolveOwnerForWorkspaceMock.mockResolvedValue("owner-1")
    resolveForOwnerMock.mockResolvedValue({
      config: {
        clientId: "app-id",
        clientSecret: "app-secret",
        verifyToken: "verify-token",
      },
    })
    ensureWhatsappCallsWebhookSubscribedMock.mockResolvedValue({
      status: "already-subscribed",
    })
  })

  test("re-asserts super admin before doing anything else", async () => {
    await call()

    expect(assertWorkspaceSuperAdminMock).toHaveBeenCalledWith("workspace-1")
  })

  test("returns the subscription result on success", async () => {
    await expect(call()).resolves.toEqual({ status: "already-subscribed" })
  })

  test("throws when the integration or workspace cannot be found", async () => {
    findByIdForWorkspaceMock.mockResolvedValue(undefined)

    await expect(call()).rejects.toThrow("whatsapp.calls.errors.notFound")
  })

  test("throws for a manual integration (no platform credential to fix)", async () => {
    findByIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      auth: { metadata: { isManual: true } },
    })

    await expect(call()).rejects.toThrow(
      "whatsapp.calls.preflight.manualIntegrationNotice",
    )
  })

  test("throws when the app subscription is missing after the fix attempt", async () => {
    ensureWhatsappCallsWebhookSubscribedMock.mockResolvedValue({
      status: "no-subscription",
    })

    await expect(call()).rejects.toThrow(
      "whatsapp.calls.preflight.appSubscriptionMissing",
    )
  })
})
