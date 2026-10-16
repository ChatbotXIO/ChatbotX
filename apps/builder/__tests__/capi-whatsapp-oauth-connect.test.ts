// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ConnectHandler = (args: {
  parsedInput: { code: string }
  bindArgsParsedInputs: readonly [string, string]
  ctx: { workspace: unknown }
}) => Promise<unknown>

const mocks = vi.hoisted(() => ({
  assertWorkspaceSuperAdmin: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  replaceAuth: vi.fn(),
  resolveForOwner: vi.fn(),
  connectCapiWithToken: vi.fn(),
  upsertCurrentCredential: vi.fn(),
  auditRecord: vi.fn(),
  resolveOwnerForWorkspace: vi.fn(),
  resolveProviderOriginForCredential: vi.fn(),
  exchangeAccessToken: vi.fn(),
  appAccessToken: vi.fn(),
  resolveOwningWabaId: vi.fn(),
  capiDatasetProvisioner: vi.fn(),
  provisioner: vi.fn(),
  surfaceCapiError: vi.fn(),
  getDataset: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: ConnectHandler) => handler
  return { workspaceActionClient: chain }
})
vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))
vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    replaceAuth: mocks.replaceAuth,
  },
  platformCredentialService: { resolveForOwner: mocks.resolveForOwner },
  metaConversionsService: { connectCapiWithToken: mocks.connectCapiWithToken },
  whatsappBusinessAccountService: {
    upsertCurrentCredential: mocks.upsertCurrentCredential,
  },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))
vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: mocks.resolveOwnerForWorkspace,
}))
vi.mock("@/lib/provider-origin", () => ({
  resolveProviderOriginForCredential: mocks.resolveProviderOriginForCredential,
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  exchangeAccessToken: mocks.exchangeAccessToken,
  appAccessToken: mocks.appAccessToken,
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/waba-owner", () => ({
  resolveOwningWabaId: mocks.resolveOwningWabaId,
}))
vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  getDataset: mocks.getDataset,
}))
vi.mock("@/features/meta-conversions/lib/provision-capi-dataset", () => ({
  capiDatasetProvisioner: mocks.capiDatasetProvisioner,
}))
vi.mock("@/features/meta-conversions/lib/surface-capi-error", () => ({
  surfaceCapiError: mocks.surfaceCapiError,
}))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

const { connectWhatsappCapiAction } = await import(
  "@/features/integration-whatsapp/actions/connect-capi.action"
)

const run = (code = "oauth-code") =>
  (connectWhatsappCapiAction as unknown as ConnectHandler)({
    parsedInput: { code },
    bindArgsParsedInputs: ["ws-1", "wa-1"],
    ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
  })

const integration = {
  id: "wa-1",
  workspaceId: "ws-1",
  wabaId: "waba-1",
  phoneNumberId: "pn-1",
}
const whatsappSettings = {
  clientId: "app-1",
  clientSecret: "secret",
  version: "v25.0",
  systemUserId: "su-1",
  systemUserToken: "su-token",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.findByIdForWorkspace.mockResolvedValue(integration)
  mocks.resolveOwnerForWorkspace.mockResolvedValue("platform-owner")
  mocks.resolveForOwner.mockResolvedValue({
    userId: null,
    config: whatsappSettings,
  })
  mocks.resolveProviderOriginForCredential.mockResolvedValue(
    "https://broker.example.test",
  )
  mocks.exchangeAccessToken.mockResolvedValue({ access_token: "wa-token" })
  mocks.appAccessToken.mockReturnValue("app-1|secret")
  mocks.resolveOwningWabaId.mockResolvedValue("waba-1")
  mocks.capiDatasetProvisioner.mockReturnValue(mocks.provisioner)
  mocks.connectCapiWithToken.mockResolvedValue({})
  mocks.surfaceCapiError.mockImplementation((error: Error) => {
    throw new Error(`surfaced:${error.message}`)
  })
})

describe("connectWhatsappCapiAction", () => {
  test("requires a super admin before any lookup or exchange", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(new Error("nope"))

    await expect(run()).rejects.toThrow("nope")

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.findByIdForWorkspace).not.toHaveBeenCalled()
    expect(mocks.exchangeAccessToken).not.toHaveBeenCalled()
  })

  test("refuses an integration that is not in the workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce(null)

    await expect(run()).rejects.toThrow(
      "metaConversions.errors.whatsappNotFound",
    )

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "wa-1",
      workspaceId: "ws-1",
    })
    expect(mocks.exchangeAccessToken).not.toHaveBeenCalled()
  })

  test("explains when the WhatsApp platform app is not configured", async () => {
    mocks.resolveForOwner.mockResolvedValueOnce(null)

    await expect(run()).rejects.toThrow(
      "whatsapp.connect.errors.appSettingsNotFound",
    )

    expect(mocks.exchangeAccessToken).not.toHaveBeenCalled()
  })

  test("exchanges the code on the registered callback and stores the token with its dataset", async () => {
    await expect(run()).resolves.toEqual({ success: true })

    expect(mocks.resolveForOwner).toHaveBeenCalledWith({
      ownerId: "platform-owner",
      type: "whatsapp",
    })
    expect(mocks.exchangeAccessToken).toHaveBeenCalledWith(
      whatsappSettings,
      "oauth-code",
      "https://broker.example.test/integrations/whatsapp/callback",
    )
    expect(mocks.resolveOwningWabaId).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "wa-token",
        phoneNumberIds: ["pn-1"],
      }),
    )
    expect(mocks.capiDatasetProvisioner).toHaveBeenCalledWith("whatsapp")
    expect(mocks.connectCapiWithToken).toHaveBeenCalledWith({
      channel: "whatsapp",
      integration,
      accessToken: "wa-token",
      provisionDataset: mocks.provisioner,
      validate: mocks.getDataset,
    })
    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update" }),
    )
  })

  test("does not report success when the integration vanished before the write", async () => {
    mocks.connectCapiWithToken.mockResolvedValueOnce(null)

    await expect(run()).rejects.toThrow(
      "metaConversions.errors.whatsappNotFound",
    )

    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("never touches the channel's own credentials", async () => {
    await run()

    expect(mocks.replaceAuth).not.toHaveBeenCalled()
    expect(mocks.upsertCurrentCredential).not.toHaveBeenCalled()
  })

  test("rejects a grant for a different WhatsApp Business Account", async () => {
    mocks.resolveOwningWabaId.mockResolvedValueOnce("someone-elses-waba")

    await expect(run()).rejects.toThrow("metaConversions.errors.wabaMismatch")

    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("reports a grant whose account cannot be resolved", async () => {
    mocks.resolveOwningWabaId.mockResolvedValueOnce(null)

    await expect(run()).rejects.toThrow(
      "whatsapp.connect.errors.wabaResolveFailed",
    )

    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })

  test("surfaces Meta's refusal to create the dataset and stores nothing", async () => {
    mocks.connectCapiWithToken.mockRejectedValueOnce(new Error("(#200)"))

    await expect(run()).rejects.toThrow("surfaced:(#200)")

    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("a failed code exchange never reaches the dataset step", async () => {
    mocks.exchangeAccessToken.mockRejectedValueOnce(new Error("bad code"))

    await expect(run()).rejects.toThrow("bad code")

    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })
})
