// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const { mockFindFirst, mockUpdateSet, mockUpdateWhere, mockDbUpdate } =
  vi.hoisted(() => {
    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
    const mockDbUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

    return {
      mockFindFirst: vi.fn(),
      mockUpdateSet,
      mockUpdateWhere,
      mockDbUpdate,
    }
  })

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowVersionModel: {
        findFirst: mockFindFirst,
      },
    },
    update: mockDbUpdate,
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowVersionModel: {
    flowId: "flowVersionModel.flowId",
    workspaceId: "flowVersionModel.workspaceId",
    isDraft: "flowVersionModel.isDraft",
  },
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    protected invalidateCacheTags() {
      // Intentionally empty: the service under test should not invalidate cache.
    }
  },
}))

const { flowVersionService } = await import("../src/flow-version/service")

describe("flowVersionService.revertDraftToPublished", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("copies the published content into the draft row", async () => {
    const publishedVersion = {
      id: "published-1",
      flowId: "flow-1",
      workspaceId: "ws-1",
      isDraft: false,
      isLatest: true,
      startNodeId: "start-1",
      nodes: [{ id: "node-1" }],
      edges: [{ id: "edge-1" }],
    }

    mockFindFirst.mockResolvedValue(publishedVersion)

    await expect(
      flowVersionService.revertDraftToPublished({
        flowId: "flow-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({
      nodes: publishedVersion.nodes,
      edges: publishedVersion.edges,
    })

    expect(mockDbUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdateSet).toHaveBeenCalledWith({
      nodes: publishedVersion.nodes,
      edges: publishedVersion.edges,
      startNodeId: publishedVersion.startNodeId,
    })
    expect(mockUpdateWhere).toHaveBeenCalledWith({
      and: [
        { eq: ["flowVersionModel.flowId", "flow-1"] },
        { eq: ["flowVersionModel.workspaceId", "ws-1"] },
        { eq: ["flowVersionModel.isDraft", true] },
      ],
    })
  })

  test("throws when no published version exists", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      flowVersionService.revertDraftToPublished({
        flowId: "flow-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("Flow version not found")
  })
})
