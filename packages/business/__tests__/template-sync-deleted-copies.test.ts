// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  labels: vi.fn(),
  detach: vi.fn(),
  project: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  loadResourceLabels: mocks.labels,
  templateInstallationSyncRepository: { detachResources: mocks.detach },
}))
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: (category: string) =>
    category === "flows"
      ? { sync: { project: mocks.project } }
      : { sync: { updatable: false } },
}))
vi.mock("../src/template/adapters/manifests/kinds", () => ({
  isManifestKind: (kind: string) => kind === "tag",
  isLabelledManifestKind: () => true,
}))
vi.mock("../src/template/adapters/manifests/resolve", () => ({
  INSTALL_ROOT_SOURCE_PREFIX: "__installRoot:",
  resolveManifests: vi.fn(),
}))

const { dropDeletedCopies } = await import("../src/template/sync-mapping")

const row = (id: string, category: string, resourceKind: string) => ({
  id,
  category,
  resourceKind,
  resourceId: `r-${id}`,
  detachedAt: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.project.mockResolvedValue({ name: "x" })
})

describe("dropDeletedCopies", () => {
  test("a copy the sync never updates is dropped once the installer deleted it", async () => {
    mocks.labels.mockResolvedValue(new Map([["product:r-2", "Kept"]]))
    const rows = [
      row("1", "products", "product"),
      row("2", "products", "product"),
      row("3", "flows", "flow"),
    ]

    const { live, gone } = await dropDeletedCopies(
      {} as never,
      "ws",
      rows as never,
    )

    expect(gone.map((r) => r.id)).toEqual(["1"])
    expect(live.map((r) => r.id)).toEqual(["2", "3"])
    expect(mocks.labels).toHaveBeenCalledWith(
      "ws",
      [rows[0], rows[1]],
      expect.anything(),
    )
    expect(mocks.detach).toHaveBeenCalledWith(["1"], expect.anything())
  })
})
