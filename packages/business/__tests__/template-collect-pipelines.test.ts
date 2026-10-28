// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findPipelines: vi.fn(),
  findStages: vi.fn().mockResolvedValue([]),
  findFields: vi.fn().mockResolvedValue([]),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      pipelineModel: { findMany: mocks.findPipelines },
      pipelineStageModel: { findMany: mocks.findStages },
      pipelineFieldModel: { findMany: mocks.findFields },
    },
  },
}))
vi.mock("@chatbotx.io/flow-config", () => ({
  collectReferencesByKind: () =>
    new Map([["pipeline", new Set(["p-1", "p-2"])]]),
}))

const { collectPipelineManifest } = await import(
  "../src/template/adapters/manifests/collect-pipelines"
)

const row = (id: string, currency: string | null) => ({
  id,
  name: id,
  referenceName: id,
  type: "opportunity",
  currency,
  settings: {},
})

beforeEach(() => {
  mocks.findStages.mockResolvedValue([])
  mocks.findFields.mockResolvedValue([])
})

describe("collectPipelineManifest currency", () => {
  test("exports the raw override: null follows the destination workspace", async () => {
    mocks.findPipelines.mockResolvedValue([row("p-1", null), row("p-2", "USD")])

    const manifest = await collectPipelineManifest("ws-1", [
      { nodes: [], edges: [] },
    ])

    expect(manifest["p-1"].currency).toBeNull()
    expect(manifest["p-2"].currency).toBe("USD")
  })
})
