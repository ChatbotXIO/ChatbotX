// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findTags: vi.fn(),
  findCustomFields: vi.fn(),
  verifyFlows: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateSnapshotRepository: {
    findTags: mocks.findTags,
    findCustomFields: mocks.findCustomFields,
  },
}))
vi.mock("../src/template/adapters/registry", () => ({
  templateAdapterRegistry: {
    flows: { collector: { verifyOwnership: mocks.verifyFlows } },
  },
}))

const { withoutDeletedResources } = await import(
  "../src/template/snapshot-collect"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("withoutDeletedResources", () => {
  test("drops a deleted tag and flow, from the view-only choices too", async () => {
    mocks.findTags.mockResolvedValue([{ id: "1" }])
    mocks.verifyFlows.mockResolvedValue(["10"])

    await expect(
      withoutDeletedResources("ws", {
        tags: { mode: "ids", ids: ["1", "2"] },
        flows: { mode: "ids", ids: ["10", "11"], lockedIds: ["11"] },
      }),
    ).resolves.toEqual({
      tags: { mode: "ids", ids: ["1"] },
      flows: { mode: "ids", ids: ["10"], lockedIds: [] },
    })
  })

  test("leaves a select-all and an empty choice alone", async () => {
    const selection = {
      flows: { mode: "all" as const },
      tags: { mode: "ids" as const, ids: [] },
    }

    await expect(withoutDeletedResources("ws", selection)).resolves.toEqual(
      selection,
    )
    expect(mocks.findTags).not.toHaveBeenCalled()
  })
})
