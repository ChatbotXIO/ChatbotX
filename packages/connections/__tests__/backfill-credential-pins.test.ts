import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listUnpinnedConnections: vi.fn(),
  pinConnectionIfUnset: vi.fn(),
  findDecryptedForUser: vi.fn(),
  findDecryptedPlatform: vi.fn(),
  findWorkspace: vi.fn(),
  resolveOwner: vi.fn(),
  loadAuth: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: {
    listUnpinnedConnections: mocks.listUnpinnedConnections,
    pinConnectionIfUnset: mocks.pinConnectionIfUnset,
    findDecryptedForUser: mocks.findDecryptedForUser,
    findDecryptedPlatform: mocks.findDecryptedPlatform,
  },
  workspaceService: { findById: mocks.findWorkspace },
  resolveCredentialOwnerIdForWorkspace: mocks.resolveOwner,
}))
vi.mock("../src/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/registry", () => ({
  CONNECTION_REGISTRY: {
    messenger: {
      credentialType: "messenger",
      store: { loadAuthByForeignKey: mocks.loadAuth },
    },
    // No credential type: never visited.
    telegram: { store: { loadAuthByForeignKey: vi.fn() } },
  },
}))

const { backfillCredentialPins } = await import(
  "../scripts/backfill-credential-pins"
)

const connection = { id: "c-1", workspaceId: "ws-1", inboxId: "inbox-1" }
const cred = (id: string, clientId: string) => ({
  id,
  config: { clientId, clientSecret: "s" },
})

beforeEach(() => {
  vi.clearAllMocks()
  // One page, then empty.
  mocks.listUnpinnedConnections
    .mockResolvedValueOnce([connection])
    .mockResolvedValue([])
  mocks.findWorkspace.mockResolvedValue({ id: "ws-1", ownerId: "sub-1" })
  mocks.resolveOwner.mockResolvedValue("reseller-1")
  mocks.findDecryptedForUser.mockResolvedValue(undefined)
  mocks.findDecryptedPlatform.mockResolvedValue(undefined)
  mocks.loadAuth.mockResolvedValue({ clientId: "app-1" })
  mocks.pinConnectionIfUnset.mockResolvedValue(true)
})

describe("backfillCredentialPins", () => {
  test("pins the one candidate whose clientId matches the stored auth", async () => {
    mocks.findDecryptedPlatform.mockResolvedValue(cred("plat", "app-1"))
    mocks.findDecryptedForUser.mockResolvedValue(cred("own", "other-app"))

    const counts = await backfillCredentialPins({ dryRun: false })

    expect(counts).toMatchObject({ pinned: 1, noMatch: 0, ambiguous: 0 })
    expect(mocks.pinConnectionIfUnset).toHaveBeenCalledWith({
      connectionId: "c-1",
      workspaceId: "ws-1",
      platformCredentialId: "plat",
    })
    expect(mocks.listUnpinnedConnections).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "messenger" }),
    )
  })

  test("leaves the pin null when no candidate matches", async () => {
    mocks.findDecryptedPlatform.mockResolvedValue(cred("plat", "other"))

    const counts = await backfillCredentialPins({ dryRun: false })

    expect(counts).toMatchObject({ pinned: 0, noMatch: 1 })
    expect(mocks.pinConnectionIfUnset).not.toHaveBeenCalled()
  })

  test("leaves the pin null when both candidates share the clientId", async () => {
    mocks.findDecryptedPlatform.mockResolvedValue(cred("plat", "app-1"))
    mocks.findDecryptedForUser.mockResolvedValue(cred("own", "app-1"))

    const counts = await backfillCredentialPins({ dryRun: false })

    expect(counts).toMatchObject({ pinned: 0, ambiguous: 1 })
    expect(mocks.pinConnectionIfUnset).not.toHaveBeenCalled()
  })

  test("skips a connection whose auth stores no clientId", async () => {
    mocks.loadAuth.mockResolvedValue({ authType: "custom" })

    const counts = await backfillCredentialPins({ dryRun: false })

    expect(counts).toMatchObject({ pinned: 0, noClientId: 1 })
    expect(mocks.findDecryptedPlatform).not.toHaveBeenCalled()
  })

  test("dry run counts the match but writes nothing", async () => {
    mocks.findDecryptedPlatform.mockResolvedValue(cred("plat", "app-1"))

    const counts = await backfillCredentialPins({ dryRun: true })

    expect(counts.pinned).toBe(1)
    expect(mocks.pinConnectionIfUnset).not.toHaveBeenCalled()
  })

  test("counts a per-connection failure and carries on", async () => {
    mocks.loadAuth.mockRejectedValue(new Error("decrypt failed"))

    const counts = await backfillCredentialPins({ dryRun: false })

    expect(counts.failed).toBe(1)
  })

  test("only visits providers that have a credential type", async () => {
    await backfillCredentialPins({ dryRun: false })

    const providers = mocks.listUnpinnedConnections.mock.calls.map(
      ([input]) => input.provider,
    )
    expect(new Set(providers)).toEqual(new Set(["messenger"]))
  })
})
