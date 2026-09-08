import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn(),
  auditChannelConnected: vi.fn().mockResolvedValue(undefined),
  connectChannelIntegration: vi.fn(),
  createId: vi.fn(() => "generated-id"),
  eq: vi.fn(),
  findConnectedIgIds: vi.fn(),
  findOrFail: vi.fn(),
  insert: vi.fn(),
  runConnectTransaction: vi.fn(),
  sql: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: { transaction: mocks.transaction },
  eq: mocks.eq,
  findOrFail: mocks.findOrFail,
  sql: mocks.sql,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationInstagramRepository: {
    findConnectedIgIds: mocks.findConnectedIgIds,
    insert: mocks.insert,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  INSTAGRAM_IG_ID_UNIQUE_CONSTRAINT: "IntegrationInstagram_igId_key",
  integrationInstagramModel: {
    pageId: "pageId",
    igId: "igId",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("../src/inbox/connect-channel", () => ({
  auditChannelConnected: mocks.auditChannelConnected,
  connectChannelIntegration: mocks.connectChannelIntegration,
  runConnectTransaction: mocks.runConnectTransaction,
}))

const { instagramIntegrationService } = await import(
  "../src/integration-instagram/service"
)

const tx = { tx: true }

function mockConnectChannelIntegration(wasCreated: boolean) {
  mocks.connectChannelIntegration.mockImplementation(
    async ({
      insertIntegration,
    }: {
      insertIntegration: (
        inboxId: string,
        wasCreated: boolean,
      ) => Promise<unknown>
    }) => {
      const integration = await insertIntegration("inbox-1", wasCreated)
      return { inbox: { id: "inbox-1" }, wasCreated, integration }
    },
  )
}

const baseInput = {
  actorUserId: "user-1",
  ownerId: "owner-1",
  workspaceId: "workspace-1",
  account: {
    igId: "ig-1",
    igName: "My Account",
    igUsername: "myaccount",
    pageId: "page-1",
  },
  auth: {},
  persistentMenus: [],
}

describe("instagramIntegrationService.connectAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.insert.mockResolvedValue({
      id: "integration-1",
      workspaceId: "workspace-1",
      igId: "ig-1",
      type: "instagram",
    })
    // Pass-through — the constraint→channelDuplicatedException mapping is
    // runConnectTransaction's own job, covered by connect-channel.test.ts.
    mocks.runConnectTransaction.mockImplementation(
      (_channel: string, body: (tx: unknown) => Promise<unknown>) =>
        mocks.transaction(body),
    )
  })

  test.each([
    "instagram",
    "facebook",
  ] as const)("inserts the repository row inside the transaction for type=%s", async (type) => {
    mockConnectChannelIntegration(true)

    const result = await instagramIntegrationService.connectAccount({
      ...baseInput,
      type,
    })

    expect(mocks.connectChannelIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        ownerId: "owner-1",
        inboxData: expect.objectContaining({
          workspaceId: "workspace-1",
          channel: "instagram",
          sourceId: "ig-1",
          name: "My Account",
        }),
      }),
    )
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        igId: "ig-1",
        username: "myaccount",
        type,
      }),
      tx,
    )
    expect(result).toEqual({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      wasCreated: true,
      integration: {
        id: "integration-1",
        workspaceId: "workspace-1",
        igId: "ig-1",
        type: "instagram",
      },
    })
  })

  test("dispatches a connect audit only when wasCreated is true", async () => {
    mockConnectChannelIntegration(true)

    await instagramIntegrationService.connectAccount({
      ...baseInput,
      type: "instagram",
    })

    expect(mocks.auditChannelConnected).toHaveBeenCalledWith({
      channel: "instagram",
      actorUserId: "user-1",
      workspaceId: "workspace-1",
      integrationId: "integration-1",
    })
  })

  test("does not dispatch an audit when the row already existed", async () => {
    mockConnectChannelIntegration(false)

    await instagramIntegrationService.connectAccount({
      ...baseInput,
      type: "instagram",
    })

    expect(mocks.auditChannelConnected).not.toHaveBeenCalled()
  })

  // The constraint→channelDuplicatedException mapping (and the audit
  // payload/log strings) are runConnectTransaction's / auditChannelConnected's
  // own contracts, exhaustively covered in connect-channel.test.ts — this
  // only guards that connectAccount propagates whatever the transaction
  // rejects with, rather than swallowing it.
  test("a transaction rejection propagates", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("connection reset"))

    await expect(
      instagramIntegrationService.connectAccount({
        ...baseInput,
        type: "instagram",
      }),
    ).rejects.toThrow("connection reset")
  })
})

describe("instagramIntegrationService.findConnectedIgIds", () => {
  test("delegates to the repository", async () => {
    mocks.findConnectedIgIds.mockResolvedValue(new Set(["ig-1"]))

    await expect(
      instagramIntegrationService.findConnectedIgIds(["ig-1", "ig-2"]),
    ).resolves.toEqual(new Set(["ig-1"]))
    expect(mocks.findConnectedIgIds).toHaveBeenCalledWith(["ig-1", "ig-2"])
  })
})
