// @vitest-environment node
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business
// ---------------------------------------------------------------------------
const findByIdForWorkspace = vi.fn()
const findWorkspaceById = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: { findByIdForWorkspace },
  workspaceService: { findById: findWorkspaceById },
}))

const record = vi.fn()
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record },
}))

const disconnectMessengerConnection = vi.fn()
vi.mock("@chatbotx.io/connections/messenger-teardown", () => ({
  disconnectMessengerConnection,
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { disconnectMessenger } = await import("../disconnect-messenger")

const DATABASE_CLIENT_IMPORT_PATTERN = /@chatbotx\.io\/database\/client/

const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"
const INTEGRATION_AUTH = { metadata: { pageId: "page-1" } }

function baseIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    inboxId: "inbox-1",
    auth: INTEGRATION_AUTH,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findByIdForWorkspace.mockResolvedValue(baseIntegration())
  findWorkspaceById.mockResolvedValue({ id: WORKSPACE_ID, ownerId: "owner-1" })
  disconnectMessengerConnection.mockResolvedValue(undefined)
})

describe("disconnect-messenger.ts source", () => {
  // Data-access rule: apps/builder must never import `db` from
  // `@chatbotx.io/database/client`, not even to open a transaction. The
  // transaction now opens inside `packages/connections/src/messenger-teardown.ts`
  // instead — this guards against the import creeping back in.
  test("never imports the database client — opening a transaction here would violate the data-access layering rule", () => {
    const sourcePath = fileURLToPath(
      new URL("../disconnect-messenger.ts", import.meta.url),
    )
    const source = readFileSync(sourcePath, "utf8")

    expect(source).not.toMatch(DATABASE_CLIENT_IMPORT_PATTERN)
  })
})

describe("disconnectMessenger", () => {
  test("delegates teardown + transaction to disconnectMessengerConnection, then records the audit entry", async () => {
    await disconnectMessenger({
      workspaceId: WORKSPACE_ID,
      id: INTEGRATION_ID,
    })

    expect(disconnectMessengerConnection).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      integrationId: INTEGRATION_ID,
      inboxId: "inbox-1",
      ownerId: "owner-1",
      auth: INTEGRATION_AUTH,
    })
    expect(record).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      action: "disconnect",
      detail: `disconnected the Messenger channel (#${INTEGRATION_ID})`,
    })
  })

  test("propagates a rolled-back transaction from disconnectMessengerConnection and never records the audit entry", async () => {
    const failure = new Error("rolled back")
    disconnectMessengerConnection.mockRejectedValueOnce(failure)

    await expect(
      disconnectMessenger({ workspaceId: WORKSPACE_ID, id: INTEGRATION_ID }),
    ).rejects.toThrow(failure)

    expect(record).not.toHaveBeenCalled()
  })

  test("a page outside the workspace is a 404 before any teardown", async () => {
    findByIdForWorkspace.mockResolvedValue(null)

    await expect(
      disconnectMessenger({ workspaceId: WORKSPACE_ID, id: INTEGRATION_ID }),
    ).rejects.toMatchObject({
      message: "Messenger channel not found",
      code: "notFound",
      httpStatusCode: 404,
    })

    expect(disconnectMessengerConnection).not.toHaveBeenCalled()
  })
})
