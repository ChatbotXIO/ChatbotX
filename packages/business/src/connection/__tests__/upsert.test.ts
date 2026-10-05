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
  isUniqueViolationError: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { update: mocks.connectionRepositoryUpdate },
}))

vi.mock("../errors", () => ({
  connectionAlreadyConnectedException: vi.fn(
    () => new Error("already connected"),
  ),
}))

vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock("../workspace-member/service", () => ({
  workspaceMemberService: {},
}))

vi.mock("../state-service", () => ({
  connectionStateService: { transition: mocks.transition },
}))

// Dynamic `import()` is required here, not a static import: the mocks above
// must be registered before `../upsert` (and its `@chatbotx.io/database/
// repositories`/`../workspace-member/service` dependencies) is evaluated,
// which only a post-`vi.mock` dynamic import guarantees — same pattern as
// `@chatbotx.io/connections`'s `internal.test.ts`.
const { upsertConnectionRow } = await import("../upsert")

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
