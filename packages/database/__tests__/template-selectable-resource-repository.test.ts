// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  flowFindMany: vi.fn(),
  tagFindMany: vi.fn(),
  automatedResponseFindMany: vi.fn(),
  savedReplyFindMany: vi.fn(),
  botFieldFindMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: { findMany: mocks.flowFindMany },
      tagModel: { findMany: mocks.tagFindMany },
      customFieldModel: { findMany: vi.fn() },
      productModel: { findMany: vi.fn() },
      aiFunctionModel: { findMany: vi.fn() },
      aiAgentModel: { findMany: vi.fn() },
      appointmentCalendarModel: { findMany: vi.fn() },
      integrationWebchatModel: { findMany: vi.fn() },
      triggerModel: { findMany: vi.fn() },
      commentAutomationModel: { findMany: vi.fn() },
      reflinkModel: { findMany: vi.fn() },
      automatedResponseModel: { findMany: mocks.automatedResponseFindMany },
      savedReplyModel: { findMany: mocks.savedReplyFindMany },
      botFieldModel: { findMany: mocks.botFieldFindMany },
    },
    $count: mocks.count,
  },
  relationsFilterToSQL: vi.fn(() => "sql-filter"),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiAgentModel: {},
  aiFunctionModel: {},
  appointmentCalendarModel: {},
  automatedResponseModel: {},
  botFieldModel: {},
  customFieldModel: {},
  commentAutomationModel: {},
  flowModel: {},
  integrationWebchatModel: {},
  productModel: {},
  reflinkModel: {},
  savedReplyModel: {},
  tagModel: {},
  triggerModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn((value: string) => `%${value}%`),
}))

const { templateSelectableResourceRepository } = await import(
  "../src/repositories/template-selectable-resource/repository"
)

describe("templateSelectableResourceRepository.listFlows", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns rows, total, and allIds when under the cap", async () => {
    mocks.flowFindMany
      .mockResolvedValueOnce([{ id: "flow-1", name: "Flow 1" }])
      .mockResolvedValueOnce([{ id: "flow-1" }])
    mocks.count.mockResolvedValue(1)

    const result = await templateSelectableResourceRepository.listFlows({
      workspaceId: "ws-1",
      offset: 0,
      limit: 100,
    })

    expect(result.rows).toEqual([{ id: "flow-1", name: "Flow 1" }])
    expect(result.total).toBe(1)
    expect(result.allIds).toEqual(["flow-1"])
  })

  test("omits allIds when offset is not 0", async () => {
    mocks.flowFindMany.mockResolvedValueOnce([])
    mocks.count.mockResolvedValue(500)

    const result = await templateSelectableResourceRepository.listFlows({
      workspaceId: "ws-1",
      offset: 100,
      limit: 100,
    })

    expect(result.allIds).toBeUndefined()
    // Only the page query ran, not the allIds query.
    expect(mocks.flowFindMany).toHaveBeenCalledTimes(1)
  })
})

describe("templateSelectableResourceRepository.listTags", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("filters out soft-deleted tags via deletedAt isNull", async () => {
    mocks.tagFindMany
      .mockResolvedValueOnce([{ id: "tag-1", name: "Tag 1" }])
      .mockResolvedValueOnce([{ id: "tag-1" }])
    mocks.count.mockResolvedValue(1)

    const result = await templateSelectableResourceRepository.listTags({
      workspaceId: "ws-1",
      offset: 0,
      limit: 100,
    })

    expect(result.rows).toEqual([{ id: "tag-1", name: "Tag 1" }])
    expect(mocks.tagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: { isNull: true },
        }),
      }),
    )
  })
})

// listKeywords and listSettings run raw SQL (microsecond keyset, UNION ALL);
// they are covered against a real database in
// packages/business/__tests__/integration/template-selectable-resources-db.test.ts.
