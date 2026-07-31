// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockFindFirst,
  mockFindFlow,
  mockUpdateSet,
  mockUpdateWhere,
  mockDbUpdate,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockDbUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet })

  return {
    mockFindFirst: vi.fn(),
    mockFindFlow: vi.fn(),
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
      flowModel: {
        findFirst: mockFindFlow,
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

describe("flowVersionService.findDraft", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("finds the draft version within the requested workspace", async () => {
    const draftVersion = {
      id: "draft-1",
      flowId: "flow-1",
      workspaceId: "ws-1",
      isDraft: true,
    }
    mockFindFirst.mockResolvedValue(draftVersion)

    await expect(
      flowVersionService.findDraft({
        flowId: "flow-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBe(draftVersion)

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        flowId: "flow-1",
        workspaceId: "ws-1",
        isDraft: true,
      },
    })
  })
})

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

describe("flowVersionService.findForButtonPayload", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("reads the pinned version when the payload carries a version id", async () => {
    const pinnedVersion = { id: "version-1", flowId: "flow-1" }
    mockFindFirst.mockResolvedValue(pinnedVersion)

    await expect(
      flowVersionService.findForButtonPayload({
        flowId: "flow-1",
        workspaceId: "ws-1",
        versionId: "version-1",
      }),
    ).resolves.toBe(pinnedVersion)

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "version-1", workspaceId: "ws-1" },
    })
    expect(mockFindFlow).not.toHaveBeenCalled()
  })

  /**
   * The regression this method exists for: Drizzle drops an `undefined` filter
   * value instead of matching on it, so querying versions by an absent id
   * silently widens to "any version in the workspace" and returns an unrelated
   * flow's nodes.
   */
  test("resolves the flow's published version when the payload carries no version id", async () => {
    const publishedVersion = { id: "version-9", flowId: "flow-1" }
    mockFindFlow.mockResolvedValue({
      id: "flow-1",
      currentVersionId: "version-9",
    })
    mockFindFirst.mockResolvedValue(publishedVersion)

    await expect(
      flowVersionService.findForButtonPayload({
        flowId: "flow-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBe(publishedVersion)

    expect(mockFindFlow).toHaveBeenCalledWith({
      where: { id: "flow-1", workspaceId: "ws-1" },
    })
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "version-9", workspaceId: "ws-1" },
    })
  })

  test("never queries versions by an undefined id", async () => {
    mockFindFlow.mockResolvedValue({ id: "flow-1", currentVersionId: null })

    await flowVersionService.findForButtonPayload({
      flowId: "flow-1",
      workspaceId: "ws-1",
    })

    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  test("returns undefined when the flow has never been published", async () => {
    mockFindFlow.mockResolvedValue({ id: "flow-1", currentVersionId: null })

    await expect(
      flowVersionService.findForButtonPayload({
        flowId: "flow-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()
  })

  test("returns undefined when the flow no longer exists", async () => {
    mockFindFlow.mockResolvedValue(undefined)

    await expect(
      flowVersionService.findForButtonPayload({
        flowId: "flow-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()
  })
})
