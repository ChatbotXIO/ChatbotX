// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn().mockResolvedValue(undefined),
  deleteMessengerIntegrationWithCleanup: vi.fn().mockResolvedValue(undefined),
  deleteInstagramIntegrationWithCleanup: vi.fn().mockResolvedValue(undefined),
  instagramExists: vi.fn().mockResolvedValue(false),
  loggerWarn: vi.fn(),
  messengerDisconnect: vi.fn().mockResolvedValue(undefined),
  messengerExists: vi.fn().mockResolvedValue(false),
  messengerFindByIdForWorkspace: vi.fn(),
  instagramFindByIdForWorkspace: vi.fn(),
  instagramDisconnect: vi.fn().mockResolvedValue(undefined),
  instagramFacebookDisconnect: vi.fn().mockResolvedValue(undefined),
  subscribePageToAppWebhook: vi.fn().mockResolvedValue(undefined),
  workspaceFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))

vi.mock("@chatbotx.io/business", () => ({
  deleteMessengerIntegrationWithCleanup:
    mocks.deleteMessengerIntegrationWithCleanup,
  deleteInstagramIntegrationWithCleanup:
    mocks.deleteInstagramIntegrationWithCleanup,
  instagramIntegrationService: {
    existsForPage: mocks.instagramExists,
    findByIdForWorkspace: mocks.instagramFindByIdForWorkspace,
  },
  messengerIntegrationService: {
    existsForPage: mocks.messengerExists,
    findByIdForWorkspace: mocks.messengerFindByIdForWorkspace,
  },
  workspaceService: { findById: mocks.workspaceFindById },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  isRevokedTokenError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  isRevokedTokenError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  isRevokedTokenError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  subscribePageToAppWebhook: mocks.subscribePageToAppWebhook,
}))

vi.mock("@chatbotx.io/utils", () => ({
  zodBigintAsString: vi.fn(),
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdAndIdRequestParams: [],
}))

vi.mock("@/integration", () => ({
  integrations: {
    instagram: { disconnect: mocks.instagramDisconnect },
    instagramFacebook: { disconnect: mocks.instagramFacebookDisconnect },
    messenger: { disconnect: mocks.messengerDisconnect },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: mocks.loggerWarn },
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClientAllowExpired: {
    bindArgsSchemas: vi.fn(() => ({
      action: vi.fn(),
    })),
  },
}))

const { disconnectMessenger } = await import(
  "../src/features/integration-messenger/actions/disconnect-messenger"
)
const { disconnectInstagram } = await import(
  "../src/features/integration-instagram/actions/disconnect-instagram"
)

const messengerRow = {
  id: "messenger-1",
  inboxId: "inbox-1",
  auth: {
    clientId: "client-1",
    tokens: { accessToken: "page-token" },
    metadata: { pageId: "page-1", version: "v99.0" },
  },
}

const instagramFacebookRow = {
  id: "instagram-1",
  inboxId: "inbox-2",
  type: "facebook",
  auth: {
    clientId: "client-1",
    metadata: { pageId: "page-1", igId: "ig-1", version: "v99.0" },
  },
}

describe("Meta disconnect actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.instagramExists.mockResolvedValue(false)
    mocks.messengerExists.mockResolvedValue(false)
    mocks.messengerDisconnect.mockResolvedValue(undefined)
    mocks.instagramDisconnect.mockResolvedValue(undefined)
    mocks.instagramFacebookDisconnect.mockResolvedValue(undefined)
    mocks.subscribePageToAppWebhook.mockResolvedValue(undefined)
    mocks.deleteMessengerIntegrationWithCleanup.mockResolvedValue(undefined)
    mocks.deleteInstagramIntegrationWithCleanup.mockResolvedValue(undefined)
    mocks.workspaceFindById.mockResolvedValue({
      id: "workspace-1",
      ownerId: "owner-1",
    })
  })

  test("messenger disconnect preserves a shared Instagram page subscription", async () => {
    mocks.messengerFindByIdForWorkspace.mockResolvedValueOnce(messengerRow)
    mocks.instagramExists.mockResolvedValueOnce(true)

    await disconnectMessenger({ workspaceId: "workspace-1", id: "messenger-1" })

    expect(mocks.messengerDisconnect).not.toHaveBeenCalled()
    expect(mocks.subscribePageToAppWebhook).toHaveBeenCalledWith({
      pageId: "page-1",
      accessToken: "page-token",
      version: "v99.0",
      subscribedFields: "general_info",
    })
    expect(mocks.deleteMessengerIntegrationWithCleanup).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "messenger-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
  })

  test("messenger disconnect calls the integration when no sibling exists", async () => {
    mocks.messengerFindByIdForWorkspace.mockResolvedValueOnce(messengerRow)

    await disconnectMessenger({ workspaceId: "workspace-1", id: "messenger-1" })

    expect(mocks.messengerDisconnect).toHaveBeenCalledWith(messengerRow.auth)
    expect(mocks.subscribePageToAppWebhook).not.toHaveBeenCalled()
    expect(mocks.deleteMessengerIntegrationWithCleanup).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "messenger-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
  })

  test("facebook-backed Instagram disconnect skips app unsubscribe when Messenger sibling exists", async () => {
    mocks.instagramFindByIdForWorkspace.mockResolvedValueOnce(
      instagramFacebookRow,
    )
    mocks.messengerExists.mockResolvedValueOnce(true)

    await disconnectInstagram({
      workspaceId: "workspace-1",
      integrationInstagramId: "instagram-1",
    })

    expect(mocks.instagramFacebookDisconnect).not.toHaveBeenCalled()
    expect(mocks.deleteInstagramIntegrationWithCleanup).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "instagram-1",
      inboxId: "inbox-2",
      ownerId: "owner-1",
      isFacebook: true,
    })
  })

  test("facebook-backed Instagram disconnect calls app unsubscribe when no Messenger sibling exists", async () => {
    mocks.instagramFindByIdForWorkspace.mockResolvedValueOnce(
      instagramFacebookRow,
    )

    await disconnectInstagram({
      workspaceId: "workspace-1",
      integrationInstagramId: "instagram-1",
    })

    expect(mocks.instagramFacebookDisconnect).toHaveBeenCalledWith(
      instagramFacebookRow.auth,
    )
    expect(mocks.deleteInstagramIntegrationWithCleanup).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "instagram-1",
      inboxId: "inbox-2",
      ownerId: "owner-1",
      isFacebook: true,
    })
    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "disconnect",
      detail: "disconnected the Instagram channel (#instagram-1)",
    })
  })

  test("messenger disconnect records a disconnect audit event after cleanup resolves", async () => {
    mocks.messengerFindByIdForWorkspace.mockResolvedValueOnce(messengerRow)

    await disconnectMessenger({ workspaceId: "workspace-1", id: "messenger-1" })

    expect(mocks.auditRecord).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      action: "disconnect",
      detail: "disconnected the Messenger channel (#messenger-1)",
    })
  })
})
