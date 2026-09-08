// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  flowFindMany: vi.fn(),
  automatedResponseFindMany: vi.fn(),
  savedReplyFindMany: vi.fn(),
  botFieldFindMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: { findMany: mocks.flowFindMany },
      tagModel: { findMany: vi.fn() },
      customFieldModel: { findMany: vi.fn() },
      productModel: { findMany: vi.fn() },
      aiFunctionModel: { findMany: vi.fn() },
      aiAgentModel: { findMany: vi.fn() },
      appointmentCalendarModel: { findMany: vi.fn() },
      integrationWebchatModel: { findMany: vi.fn() },
      triggerModel: { findMany: vi.fn() },
      fbCommentAutomationModel: { findMany: vi.fn() },
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
  fbCommentAutomationModel: {},
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

describe("templateSelectableResourceRepository.listKeywords", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes to inbound type and labels rows via text, falling back to keywords", async () => {
    mocks.automatedResponseFindMany
      .mockResolvedValueOnce([
        { id: "kw-1", text: "hello", keywords: ["hi"] },
        { id: "kw-2", text: null, keywords: ["bye", "later"] },
        { id: "kw-3", text: "  ", keywords: [] },
      ])
      .mockResolvedValueOnce([{ id: "kw-1" }, { id: "kw-2" }, { id: "kw-3" }])
    mocks.count.mockResolvedValue(3)

    const result = await templateSelectableResourceRepository.listKeywords({
      workspaceId: "ws-1",
      offset: 0,
      limit: 100,
    })

    expect(result.rows).toEqual([
      { id: "kw-1", name: "hello" },
      { id: "kw-2", name: "bye, later" },
      { id: "kw-3", name: "(untitled)" },
    ])

    const call = mocks.automatedResponseFindMany.mock.calls[0]?.[0] as {
      where: { type: string }
    }
    expect(call.where.type).toBe("inbound")
  })
})

describe("templateSelectableResourceRepository.listSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the two raw arrays scoped to the workspace", async () => {
    mocks.savedReplyFindMany.mockResolvedValue([
      { id: "sr-1", shortcut: "/hello" },
    ])
    mocks.botFieldFindMany.mockResolvedValue([{ id: "bf-1", name: "Age" }])

    const result =
      await templateSelectableResourceRepository.listSettings("ws-1")

    expect(result).toEqual({
      savedReplies: [{ id: "sr-1", shortcut: "/hello" }],
      botFields: [{ id: "bf-1", name: "Age" }],
    })
    expect(mocks.savedReplyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-1" } }),
    )
  })
})
