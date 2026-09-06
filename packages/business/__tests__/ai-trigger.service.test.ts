import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// aiTriggerService — list/create/duplicate for AI Triggers. `list` applies
// the ilike name filter only when non-empty and returns a paginated
// envelope; `create` inserts with a generated id; `duplicate` copies a
// source row's non-identity columns with a "_copy" suffixed name.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  countWithRelationsFilter: vi.fn(async () => 0),
  findFirstAiTrigger: vi.fn(),
  findManyAiTrigger: vi.fn(async () => []),
  findOrFail: vi.fn(),
  insertValues: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  countWithRelationsFilter: mocks.countWithRelationsFilter,
  db: {
    insert: vi.fn(() => ({ values: mocks.insertValues })),
    query: {
      aiTriggerModel: {
        findFirst: mocks.findFirstAiTrigger,
        findMany: mocks.findManyAiTrigger,
      },
    },
  },
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiTriggerModel: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
    createdAt: "createdAt",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "trigger-1",
}))

const { aiTriggerService } = await import("../src/ai-trigger/service")

const workspaceId = "workspace-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findManyAiTrigger.mockResolvedValue([])
  mocks.countWithRelationsFilter.mockResolvedValue(0)
})

describe("aiTriggerService.list", () => {
  test("returns a paginated envelope with pageCount computed from total/limit", async () => {
    mocks.findManyAiTrigger.mockResolvedValue([{ id: "trigger-1" }])
    mocks.countWithRelationsFilter.mockResolvedValue(21)

    const result = await aiTriggerService.list({
      workspaceId,
      page: 1,
      perPage: 20,
      sort: [],
    })

    expect(result).toEqual({ data: [{ id: "trigger-1" }], pageCount: 2 })
  })

  test("applies the ilike name filter only when name is non-empty", async () => {
    await aiTriggerService.list({
      workspaceId,
      page: 1,
      perPage: 20,
      sort: [],
      name: "support",
    })

    expect(mocks.findManyAiTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ ilike: expect.any(String) }),
        }),
      }),
    )

    vi.clearAllMocks()
    mocks.findManyAiTrigger.mockResolvedValue([])
    mocks.countWithRelationsFilter.mockResolvedValue(0)

    await aiTriggerService.list({
      workspaceId,
      page: 1,
      perPage: 20,
      sort: [],
      name: "",
    })

    expect(mocks.findManyAiTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ name: undefined }),
      }),
    )
  })
})

describe("aiTriggerService.create", () => {
  test("inserts with a generated id and the workspaceId", async () => {
    await aiTriggerService.create(workspaceId, {
      name: "New trigger",
      description: null,
      questions: [],
      flowId: null,
      finalMessage: null,
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New trigger",
        workspaceId,
        id: "trigger-1",
      }),
    )
  })
})

describe("aiTriggerService.duplicate", () => {
  test("copies the source row with a _copy suffixed name, without id/createdAt/updatedAt", async () => {
    mocks.findOrFail.mockResolvedValue({
      id: "source-1",
      workspaceId,
      name: "Support flow",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      description: "desc",
      flowId: "flow-1",
      questions: [],
      finalMessage: null,
    })

    await aiTriggerService.duplicate({ workspaceId, id: "source-1" })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Support flow _copy",
        workspaceId,
        description: "desc",
        flowId: "flow-1",
      }),
    )
    const insertedPayload = mocks.insertValues.mock.calls.at(-1)?.[0]
    expect(insertedPayload).not.toHaveProperty("id")
    expect(insertedPayload).not.toHaveProperty("createdAt")
    expect(insertedPayload).not.toHaveProperty("updatedAt")
  })
})
