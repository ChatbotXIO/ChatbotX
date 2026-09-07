import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dispatchAuditRecordSafely: vi.fn().mockResolvedValue(undefined),
  isUniqueViolationError: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  INSTAGRAM_IG_ID_UNIQUE_CONSTRAINT: "IntegrationInstagram_igId_key",
  MESSENGER_PAGE_ID_UNIQUE_CONSTRAINT: "IntegrationMessenger_pageId_key",
  WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT:
    "IntegrationWhatsapp_phoneNumberId_key",
  inboxModel: {},
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecordSafely: mocks.dispatchAuditRecordSafely,
}))

// `connectChannelIntegration` (untested here — covered by the three
// per-channel service tests) is the only export that needs `inboxService`;
// stubbing it keeps this file from pulling in the real service's
// redis/quota dependency chain.
vi.mock("../src/inbox/service", () => ({
  inboxService: { create: vi.fn(), isConnected: vi.fn() },
}))

const {
  CHANNEL_CONNECT_DESCRIPTORS,
  auditChannelConnected,
  runConnectTransaction,
} = await import("../src/inbox/connect-channel")

type ConnectDescriptorChannel = keyof typeof CHANNEL_CONNECT_DESCRIPTORS

const CHANNELS = Object.keys(
  CHANNEL_CONNECT_DESCRIPTORS,
) as ConnectDescriptorChannel[]

describe("runConnectTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("runs the body inside db.transaction and returns its result", async () => {
    mocks.transaction.mockImplementation(
      async (body: (tx: unknown) => Promise<unknown>) => body("tx-token"),
    )

    await expect(
      runConnectTransaction("messenger", (tx) => {
        expect(tx).toBe("tx-token")
        return Promise.resolve("ok")
      }),
    ).resolves.toBe("ok")
  })

  test.each(
    CHANNELS,
  )("%s: a unique violation on its own duplicateConstraint is translated to channelDuplicatedException", async (channel) => {
    const { duplicateConstraint } = CHANNEL_CONNECT_DESCRIPTORS[channel]
    const error = new Error("duplicate key")
    mocks.transaction.mockRejectedValueOnce(error)
    mocks.isUniqueViolationError.mockImplementation(
      (err: unknown, constraint?: string) =>
        err === error && constraint === duplicateConstraint,
    )

    await expect(
      runConnectTransaction(channel, () => Promise.resolve("unused")),
    ).rejects.toMatchObject({ code: "channelDuplicated" })

    expect(mocks.isUniqueViolationError).toHaveBeenCalledWith(
      error,
      duplicateConstraint,
    )
  })

  test.each(
    CHANNELS,
  )("%s: an error that isn't its own duplicateConstraint violation rethrows unchanged", async (channel) => {
    const error = new Error("connection reset")
    mocks.transaction.mockRejectedValueOnce(error)
    mocks.isUniqueViolationError.mockReturnValue(false)

    await expect(
      runConnectTransaction(channel, () => Promise.resolve("unused")),
    ).rejects.toBe(error)
  })
})

describe("auditChannelConnected", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each(
    CHANNELS.map(
      (channel) => [channel, CHANNEL_CONNECT_DESCRIPTORS[channel]] as const,
    ),
  )("%s: dispatches the connected-channel audit payload and failure-log string for its own noun", async (channel, {
    auditNoun,
  }) => {
    await auditChannelConnected({
      actorUserId: "user-1",
      channel,
      integrationId: "integration-1",
      workspaceId: "workspace-1",
    })

    expect(mocks.dispatchAuditRecordSafely).toHaveBeenCalledWith(
      {
        action: "connect",
        detail: `connected a new ${auditNoun} channel (#integration-1)`,
        userId: "user-1",
        workspaceId: "workspace-1",
      },
      `audit dispatch failed after ${auditNoun} connect`,
    )
  })
})
