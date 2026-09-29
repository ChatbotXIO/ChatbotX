import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { whereMock, selectMock } = vi.hoisted(() => {
  const whereMock = vi.fn()
  const fromMock = vi.fn(() => ({ where: whereMock }))
  return { whereMock, selectMock: vi.fn(() => ({ from: fromMock })) }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/database/client")>()),
  db: { select: selectMock },
}))

const { selectLabelsByIds } = await import("../src/select-labels-by-ids")
const { sequenceModel } = await import("@chatbotx.io/database/schema")
const { eq } = await import("@chatbotx.io/database/client")

describe("selectLabelsByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    whereMock.mockResolvedValue([{ id: "1", name: "Onboarding" }])
  })

  test("does not query when there are no ids", async () => {
    await expect(
      selectLabelsByIds(sequenceModel, { workspaceId: "ws-1", ids: [] }),
    ).resolves.toEqual([])
    expect(selectMock).not.toHaveBeenCalled()
  })

  test("selects only id and name and returns the rows", async () => {
    const labels = await selectLabelsByIds(sequenceModel, {
      workspaceId: "ws-1",
      ids: ["1", "2"],
    })

    expect(selectMock).toHaveBeenCalledWith({
      id: sequenceModel.id,
      name: sequenceModel.name,
    })
    expect(labels).toEqual([{ id: "1", name: "Onboarding" }])
  })

  test("adds the entity's own where rule to the workspace and id match", async () => {
    const dialect = new PgDialect()
    const whereSql = () => dialect.sqlToQuery(whereMock.mock.calls.at(-1)?.[0])

    await selectLabelsByIds(sequenceModel, { workspaceId: "ws-1", ids: ["1"] })
    const base = whereSql()
    await selectLabelsByIds(sequenceModel, {
      workspaceId: "ws-1",
      ids: ["1"],
      where: eq(sequenceModel.active, true),
    })
    const withRule = whereSql()

    expect(base.sql).toContain('"workspaceId" = $1')
    expect(base.sql).toContain('"id" in ($2)')
    expect(base.params).toEqual(["ws-1", "1"])
    expect(base.sql).not.toContain('"active"')
    expect(withRule.sql).toContain('"active" = $3')
    expect(withRule.params).toEqual(["ws-1", "1", true])
  })
})
