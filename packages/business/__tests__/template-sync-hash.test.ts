// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listInstalled: vi.fn(),
  markSynced: vi.fn(),
  project: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationSyncRepository: {
    listInstalledResources: mocks.listInstalled,
    markSynced: mocks.markSynced,
  },
}))
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: (category: string) =>
    category === "flows" ? { sync: { project: mocks.project } } : undefined,
}))

const { stampSyncedHashes } = await import("../src/template/sync-hash")

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  category: "flows",
  resourceId: "tgt-1",
  wasExisting: false,
  detachedAt: null,
  syncedVersion: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ name: "A" })
})

describe("stampSyncedHashes", () => {
  test("stamps a copy that has no baseline yet", async () => {
    mocks.listInstalled.mockResolvedValue([row()])
    await stampSyncedHashes({} as never, "inst-1", 2)
    expect(mocks.markSynced).toHaveBeenCalledWith(
      expect.objectContaining({ id: "row-1", syncedVersion: 2 }),
      expect.anything(),
    )
  })

  test("never moves a baseline a sync already set", async () => {
    mocks.listInstalled.mockResolvedValue([row({ syncedVersion: 1 })])
    await stampSyncedHashes({} as never, "inst-1", 2)
    expect(mocks.markSynced).not.toHaveBeenCalled()
  })

  test("leaves rows a sync skipped, reused rows, detached rows and unsyncable categories", async () => {
    mocks.listInstalled.mockResolvedValue([
      row({ id: "skipped" }),
      row({ id: "reused", wasExisting: true }),
      row({ id: "gone", detachedAt: new Date() }),
      row({ id: "no-handler", category: "products" }),
    ])
    await stampSyncedHashes({} as never, "inst-1", 2, new Set(["skipped"]))
    expect(mocks.markSynced).not.toHaveBeenCalled()
  })

  test("stores no hash for a copy that is already gone", async () => {
    mocks.listInstalled.mockResolvedValue([row()])
    mocks.project.mockResolvedValue(null)
    await stampSyncedHashes({} as never, "inst-1", 2)
    expect(mocks.markSynced).toHaveBeenCalledWith(
      expect.objectContaining({ syncedHash: null }),
      expect.anything(),
    )
  })
})
