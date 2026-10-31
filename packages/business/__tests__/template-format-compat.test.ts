// @vitest-environment node

import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  tagFindMany: vi.fn(),
  customFieldFindMany: vi.fn(),
  flowsCollect: vi.fn(),
  sequencesCollect: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      tagModel: { findMany: mocks.tagFindMany },
      customFieldModel: { findMany: mocks.customFieldFindMany },
    },
  },
}))
vi.mock("../src/template/adapters/registry", () => ({
  templateAdapterRegistry: {
    flows: {
      minFormatVersion: 1,
      collector: {
        resolveIds: vi.fn().mockResolvedValue([]),
        verifyOwnership: vi.fn().mockResolvedValue(["flow-1"]),
        collect: mocks.flowsCollect,
      },
    },
    sequences: {
      minFormatVersion: 2,
      collector: {
        resolveIds: vi.fn().mockResolvedValue([]),
        verifyOwnership: vi.fn().mockResolvedValue(["seq-1"]),
        collect: mocks.sequencesCollect,
      },
    },
  },
}))
vi.mock("../src/template/adapters/manifests/collect-hierarchies", () => ({
  collectFolderAncestry: vi.fn().mockResolvedValue({}),
  collectProductCategoryAncestry: vi.fn().mockResolvedValue({}),
}))
vi.mock("../src/template/adapters/manifests/collect-pipelines", () => ({
  collectPipelineManifest: vi.fn().mockResolvedValue({}),
}))

const { buildTemplateSnapshot } = await import(
  "../src/template/snapshot.service"
)

/**
 * What a worker deployed before v2 does with a payload: it only knows
 * format 1 and refuses anything else instead of stripping parts it cannot
 * read (the D2 contract the writers rely on).
 */
const oldReaderParse = (raw: { formatVersion: unknown }) =>
  raw.formatVersion === 1
    ? parseTemplateExport(raw)
    : {
        ok: false as const,
        reason: `Unsupported template export format version: ${String(raw.formatVersion)}`,
      }

const flowEntry = {
  sourceId: "flow-1",
  name: "Welcome",
  active: true,
  enableInInbox: true,
  startNodeId: "n1",
  nodes: [],
  edges: [],
  folderId: null,
}
const emptyCollect = {
  entries: [],
  folderIds: [],
  productCategoryIds: [],
  hardDependencies: [],
}

const snapshot = (selection: Record<string, unknown>) =>
  buildTemplateSnapshot({
    workspaceId: "ws-1",
    tenantId: "1",
    selection: selection as never,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tagFindMany.mockResolvedValue([])
  mocks.customFieldFindMany.mockResolvedValue([])
  mocks.flowsCollect.mockResolvedValue({
    ...emptyCollect,
    entries: [flowEntry],
  })
  mocks.sequencesCollect.mockResolvedValue(emptyCollect)
})

describe("template format versions: mixed deployments", () => {
  test("a snapshot a v1 reader can express is written as v1 and the old reader installs it", async () => {
    const { payload } = await snapshot({
      flows: { mode: "ids", ids: ["flow-1"] },
    })

    expect(payload.formatVersion).toBe(1)
    expect(oldReaderParse(payload).ok).toBe(true)
  })

  test("a snapshot that uses a v2-only category is written as v2 and the old reader rejects it clearly", async () => {
    mocks.sequencesCollect.mockResolvedValue({
      ...emptyCollect,
      entries: [
        {
          sourceId: "seq-1",
          name: "Drip",
          active: true,
          folderId: null,
          steps: [],
        },
      ],
    })

    const { payload } = await snapshot({
      flows: { mode: "ids", ids: ["flow-1"] },
      sequences: { mode: "ids", ids: ["seq-1"] },
    })

    expect(payload.formatVersion).toBe(2)
    expect(oldReaderParse(payload)).toEqual({
      ok: false,
      reason: "Unsupported template export format version: 2",
    })
  })

  test("a v2 payload with content the reader does not know is not silently accepted by a v1-only reader", () => {
    const v2 = {
      formatVersion: 2,
      exportedAt: "2026-01-01T00:00:00.000Z",
      source: { workspaceId: "1", tenantId: "1" },
      manifests: {},
      resources: { sequences: [{ sourceId: "s", name: "Drip", steps: [] }] },
      permissions: { sequences: { s: { allowEdit: false } } },
    }
    expect(oldReaderParse(v2).ok).toBe(false)
    // The current reader keeps every part (nothing is stripped).
    const parsed = parseTemplateExport(v2)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.resources.sequences).toHaveLength(1)
      expect(parsed.data.permissions).toEqual(v2.permissions)
    }
  })

  test("the current reader installs a v1 payload: newer categories default to empty", () => {
    const v1 = {
      formatVersion: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      source: { workspaceId: "1", tenantId: "1" },
      manifests: { tags: { "5": { name: "vip" } } },
      resources: { flows: [flowEntry] },
    }
    const parsed = parseTemplateExport(v1)

    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.formatVersion).toBe(1)
      expect(parsed.data.resources.flows).toHaveLength(1)
      expect(parsed.data.resources.sequences).toEqual([])
      expect(parsed.data.manifests.inboxes).toEqual({})
    }
  })

  test("an unknown format version is refused by the current reader too", () => {
    expect(parseTemplateExport({ formatVersion: 3 })).toEqual({
      ok: false,
      reason: "Unsupported template export format version: 3",
    })
  })
})
