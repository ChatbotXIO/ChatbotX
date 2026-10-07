import type { ConnectionModel } from "@chatbotx.io/database/types"
import type { ConnectionDescriptor } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ConnectionStoreBinding } from "../store-bindings"

// ---------------------------------------------------------------------------
// `upsertConnectionRow`'s revive-in-place branch (`existing` truthy) must
// keep `Connection.sourceId` in sync with the just-validated `descriptor`.
// This matters for a provider like `openaiCompatible`, whose `sourceId` IS
// its own config (`baseURL`): a revive that also updates that config value
// via `store.saveAuthByForeignKey` must not leave `Connection.sourceId`
// pointing at a stale value.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectionRepositoryUpdate: vi.fn(),
  transition: vi.fn(),
  compensateQuotaConsumption: vi.fn(async () => undefined),
  compensateWorkspaceQuota: vi.fn(async () => undefined),
  findOwnerUserIdByWorkspaceId: vi.fn(async () => "owner-1"),
  isUniqueViolationError: vi.fn(() => false),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { update: mocks.connectionRepositoryUpdate },
}))

vi.mock("../../errors", () => ({
  connectionAlreadyConnectedException: vi.fn(
    () => new Error("already connected"),
  ),
}))

vi.mock("../../logger", () => ({
  logger: { warn: vi.fn(), error: mocks.loggerError, info: vi.fn() },
}))

vi.mock("../../workspace/quota-consumption", () => ({
  compensateWorkspaceQuotaConsumption: mocks.compensateWorkspaceQuota,
}))

vi.mock("../../workspace-member/service", () => ({
  workspaceMemberService: {
    findOwnerUserIdByWorkspaceId: mocks.findOwnerUserIdByWorkspaceId,
  },
}))

vi.mock("../state-service", () => ({
  connectionStateService: {
    transition: mocks.transition,
    compensateQuotaConsumption: mocks.compensateQuotaConsumption,
  },
}))

// Dynamic `import()` is required here, not a static import: the mocks above
// must be registered before `../upsert` (and its `@chatbotx.io/database/
// repositories`/`../workspace-member/service` dependencies) is evaluated,
// which only a post-`vi.mock` dynamic import guarantees — same pattern as
// `@chatbotx.io/connections`'s `internal.test.ts`.
const {
  upsertConnectionRow,
  withQuotaCompensation,
  resolveOwnerId,
  resolveForeignKey,
  toChannelType,
} = await import("../upsert")

beforeEach(() => {
  vi.clearAllMocks()
})

const auth = { authType: "secretText", secretText: "secret" } as const

const existingConnection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  inboxId: null,
  integrationId: "integration-1",
  // Stale identity: this row was connected against the OLD baseURL.
  sourceId: "https://old.example.com",
} as unknown as ConnectionModel

describe("upsertConnectionRow — revive-in-place sourceId sync", () => {
  it("updates Connection.sourceId to the freshly validated descriptor's sourceId", async () => {
    const store: ConnectionStoreBinding = {
      loadAuthByForeignKey: vi.fn(),
      saveAuthByForeignKey: vi.fn(async () => true),
      insertRow: vi.fn(),
      deleteRowByForeignKey: vi.fn(),
      configColumns: ["baseURL"],
    }

    mocks.transition.mockResolvedValue({
      ...existingConnection,
      sourceId: "https://new.example.com",
    })

    const descriptor: ConnectionDescriptor = {
      // The NEW baseURL — this is what `openaiCompatibleConnectionProvider`'s
      // `describe()` returns, since its `sourceId` IS `auth.baseURL`.
      sourceId: "https://new.example.com",
      displayName: "OpenAI-compatible",
    }

    await upsertConnectionRow({
      tx: {} as never,
      workspaceId: "workspace-1",
      provider: "openaiCompatible",
      kind: "integration",
      descriptor,
      auth,
      extraConfig: { baseURL: "https://new.example.com" },
      existing: existingConnection,
      store,
      ownerId: "owner-1",
      quotaConsumption: { consumed: false, workspaceUsageIncremented: false },
    })

    expect(mocks.connectionRepositoryUpdate).toHaveBeenCalledTimes(1)
    const [updateInput] = mocks.connectionRepositoryUpdate.mock.calls[0]
    expect(updateInput.values.sourceId).toBe("https://new.example.com")
  })
})

describe("withQuotaCompensation", () => {
  it("returns the operation's result and never compensates when it succeeds", async () => {
    const result = await withQuotaCompensation(
      {
        ownerId: "owner-1",
        quotaConsumption: {
          consumed: true,
          workspaceId: "ws-1",
          workspaceUsageIncremented: true,
        },
        context: { connectionId: "conn-1" },
      },
      async () => "ok",
    )

    expect(result).toBe("ok")
    expect(mocks.compensateQuotaConsumption).not.toHaveBeenCalled()
  })

  it("compensates the tracked quota consumption and rethrows the original error", async () => {
    const operationError = new Error("transaction rolled back")

    await expect(
      withQuotaCompensation(
        {
          ownerId: "owner-1",
          quotaConsumption: {
            consumed: true,
            workspaceId: "ws-1",
            workspaceUsageIncremented: true,
          },
          context: { connectionId: "conn-1" },
        },
        () => {
          throw operationError
        },
      ),
    ).rejects.toBe(operationError)

    expect(mocks.compensateQuotaConsumption).toHaveBeenCalledWith({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspaceUsageIncremented: true,
    })
  })

  it("skips compensation when nothing was consumed, and still rethrows", async () => {
    const operationError = new Error("transaction rolled back")

    await expect(
      withQuotaCompensation(
        {
          ownerId: "owner-1",
          quotaConsumption: {
            consumed: false,
            workspaceUsageIncremented: false,
          },
          context: {},
        },
        () => {
          throw operationError
        },
      ),
    ).rejects.toBe(operationError)

    expect(mocks.compensateQuotaConsumption).not.toHaveBeenCalled()
  })

  it("skips compensation when no ownerId is available, and still rethrows", async () => {
    const operationError = new Error("transaction rolled back")

    await expect(
      withQuotaCompensation(
        {
          ownerId: undefined,
          quotaConsumption: {
            consumed: true,
            workspaceId: "ws-1",
            workspaceUsageIncremented: true,
          },
          context: {},
        },
        () => {
          throw operationError
        },
      ),
    ).rejects.toBe(operationError)

    expect(mocks.compensateQuotaConsumption).not.toHaveBeenCalled()
  })

  it("logs (but does not throw) a compensation failure, surfacing the original operation error", async () => {
    const operationError = new Error("transaction rolled back")
    mocks.compensateQuotaConsumption.mockRejectedValueOnce(
      new Error("redis unavailable"),
    )

    await expect(
      withQuotaCompensation(
        {
          ownerId: "owner-1",
          quotaConsumption: {
            consumed: true,
            workspaceId: "ws-1",
            workspaceUsageIncremented: false,
          },
          context: { connectionId: "conn-1" },
        },
        () => {
          throw operationError
        },
      ),
    ).rejects.toBe(operationError)

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: "redis unavailable" }),
        connectionId: "conn-1",
        workspaceId: "ws-1",
        ownerId: "owner-1",
      }),
      "connection: quota compensation failed",
    )
  })
})

describe("withQuotaCompensation — workspace seat", () => {
  it("also hands back a workspace seat consumed inside the failed transaction", async () => {
    const operationError = new Error("transaction rolled back")
    const workspaceQuotaConsumption = {
      consumed: true as const,
      userId: "user-1",
      workspaceId: "ws-new",
    }

    await expect(
      withQuotaCompensation(
        {
          ownerId: "owner-1",
          quotaConsumption: {
            consumed: false,
            workspaceUsageIncremented: false,
          },
          workspaceQuotaConsumption,
          context: { provider: "telegram" },
        },
        () => {
          throw operationError
        },
      ),
    ).rejects.toBe(operationError)

    expect(mocks.compensateWorkspaceQuota).toHaveBeenCalledWith(
      workspaceQuotaConsumption,
    )
  })

  it("never touches the workspace seat when the operation succeeds", async () => {
    await withQuotaCompensation(
      {
        ownerId: "owner-1",
        quotaConsumption: { consumed: false, workspaceUsageIncremented: false },
        workspaceQuotaConsumption: {
          consumed: true,
          userId: "user-1",
          workspaceId: "ws-new",
        },
        context: { provider: "telegram" },
      },
      async () => "ok",
    )

    expect(mocks.compensateWorkspaceQuota).not.toHaveBeenCalled()
  })
})

describe("resolveOwnerId", () => {
  it("resolves the workspace owner for a channel-kind connection", async () => {
    const ownerId = await resolveOwnerId({
      kind: "channel",
      workspaceId: "workspace-1",
    })

    expect(ownerId).toBe("owner-1")
    expect(mocks.findOwnerUserIdByWorkspaceId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  it("returns undefined for an integration-kind connection without looking up an owner", async () => {
    const ownerId = await resolveOwnerId({
      kind: "integration",
      workspaceId: "workspace-1",
    })

    expect(ownerId).toBeUndefined()
    expect(mocks.findOwnerUserIdByWorkspaceId).not.toHaveBeenCalled()
  })
})

describe("resolveForeignKey", () => {
  it("prefers inboxId when present", () => {
    expect(
      resolveForeignKey({
        inboxId: "inbox-1",
        integrationId: "integration-1",
      } as ConnectionModel),
    ).toBe("inbox-1")
  })

  it("falls back to integrationId when inboxId is null", () => {
    expect(
      resolveForeignKey({
        inboxId: null,
        integrationId: "integration-1",
      } as ConnectionModel),
    ).toBe("integration-1")
  })

  it("returns null when neither FK is set (chatbotx)", () => {
    expect(
      resolveForeignKey({
        inboxId: null,
        integrationId: null,
      } as ConnectionModel),
    ).toBeNull()
  })
})

describe("toChannelType", () => {
  it("maps instagramFacebook onto the shared instagram channel", () => {
    expect(toChannelType("instagramFacebook")).toBe("instagram")
  })

  it("passes other channel providers through unchanged", () => {
    expect(toChannelType("messenger")).toBe("messenger")
  })
})
