// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const txChain = {
    set: vi.fn(),
    where: vi.fn(),
  }
  txChain.set.mockReturnValue(txChain)
  txChain.where.mockResolvedValue(undefined)

  const tx = {
    update: vi.fn(() => txChain),
    delete: vi.fn(() => txChain),
  }

  return {
    dbTransaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback(tx),
    ),
    coexistTearDownForIntegration: vi.fn().mockResolvedValue(undefined),
    findOrFail: vi.fn(),
    inboxDisconnect: vi.fn().mockResolvedValue(undefined),
    instagramExists: vi.fn().mockResolvedValue(false),
    metaCapiDeleteByIntegration: vi.fn().mockResolvedValue(undefined),
    loggerWarn: vi.fn(),
    messengerDisconnect: vi.fn().mockResolvedValue(undefined),
    messengerExists: vi.fn().mockResolvedValue(false),
    instagramDisconnect: vi.fn().mockResolvedValue(undefined),
    instagramFacebookDisconnect: vi.fn().mockResolvedValue(undefined),
    subscribePageToAppWebhook: vi.fn().mockResolvedValue(undefined),
    tx,
    txChain,
    workspaceFindById: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business", () => ({
  coexistService: {
    tearDownForIntegration: mocks.coexistTearDownForIntegration,
  },
  inboxService: { disconnect: mocks.inboxDisconnect },
  instagramIntegrationService: { existsForPage: mocks.instagramExists },
  messengerIntegrationService: { existsForPage: mocks.messengerExists },
  workspaceService: { findById: mocks.workspaceFindById },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.dbTransaction },
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mocks.findOrFail,
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCapiEventRepository: {
    deleteByIntegration: mocks.metaCapiDeleteByIntegration,
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  coexistSyncRunModel: {
    finishedAt: "finishedAt",
    integrationId: "integrationId",
    status: "status",
  },
  integrationInstagramModel: { id: "instagramId" },
  integrationMessengerModel: { id: "messengerId" },
  tagChannelModel: {
    channelType: "channelType",
    integrationId: "tagIntegrationId",
  },
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

vi.mock("@/features/common/schemas", () => ({
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
    mocks.dbTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<void>) => callback(mocks.tx),
    )
    mocks.instagramExists.mockResolvedValue(false)
    mocks.messengerExists.mockResolvedValue(false)
    mocks.messengerDisconnect.mockResolvedValue(undefined)
    mocks.instagramDisconnect.mockResolvedValue(undefined)
    mocks.instagramFacebookDisconnect.mockResolvedValue(undefined)
    mocks.subscribePageToAppWebhook.mockResolvedValue(undefined)
    mocks.workspaceFindById.mockResolvedValue({
      id: "workspace-1",
      ownerId: "owner-1",
    })
  })

  test("messenger disconnect preserves a shared Instagram page subscription", async () => {
    mocks.findOrFail.mockResolvedValueOnce(messengerRow)
    mocks.instagramExists.mockResolvedValueOnce(true)

    await disconnectMessenger({ workspaceId: "workspace-1", id: "messenger-1" })

    expect(mocks.messengerDisconnect).not.toHaveBeenCalled()
    expect(mocks.subscribePageToAppWebhook).toHaveBeenCalledWith({
      pageId: "page-1",
      accessToken: "page-token",
      version: "v99.0",
      subscribedFields: "general_info",
    })
    expect(mocks.inboxDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      tx: mocks.tx,
    })
  })

  test("messenger disconnect calls the integration when no sibling exists", async () => {
    mocks.findOrFail.mockResolvedValueOnce(messengerRow)

    await disconnectMessenger({ workspaceId: "workspace-1", id: "messenger-1" })

    expect(mocks.messengerDisconnect).toHaveBeenCalledWith(messengerRow.auth)
    expect(mocks.subscribePageToAppWebhook).not.toHaveBeenCalled()
    expect(mocks.metaCapiDeleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        channel: "messenger",
        integrationId: "messenger-1",
      },
      mocks.tx,
    )
  })

  test("facebook-backed Instagram disconnect skips app unsubscribe when Messenger sibling exists", async () => {
    mocks.findOrFail.mockResolvedValueOnce(instagramFacebookRow)
    mocks.messengerExists.mockResolvedValueOnce(true)

    await disconnectInstagram({
      workspaceId: "workspace-1",
      integrationInstagramId: "instagram-1",
    })

    expect(mocks.instagramFacebookDisconnect).not.toHaveBeenCalled()
    expect(mocks.inboxDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-2",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      tx: mocks.tx,
    })
  })

  test("facebook-backed Instagram disconnect calls app unsubscribe when no Messenger sibling exists", async () => {
    mocks.findOrFail.mockResolvedValueOnce(instagramFacebookRow)

    await disconnectInstagram({
      workspaceId: "workspace-1",
      integrationInstagramId: "instagram-1",
    })

    expect(mocks.instagramFacebookDisconnect).toHaveBeenCalledWith(
      instagramFacebookRow.auth,
    )
    expect(mocks.metaCapiDeleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        channel: "instagram",
        integrationId: "instagram-1",
      },
      mocks.tx,
    )
  })
})
