import { beforeEach, describe, expect, test, vi } from "vitest"

type Row = Record<string, unknown>
type IsNullCondition = { isNull: boolean }

const isIsNullCondition = (value: unknown): value is IsNullCondition =>
  typeof value === "object" && value !== null && "isNull" in value

const matchesWhere = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, condition]) => {
    if (isIsNullCondition(condition)) {
      return condition.isNull ? row[key] == null : row[key] != null
    }
    return row[key] === condition
  })

const templateRows: Row[] = [
  {
    id: "template-a",
    workspaceId: "workspace-a",
    tenantId: "tenant-1",
    deletedAt: null,
    name: "Template A",
  },
]

const findFirst = vi.fn(
  async ({ where }: { where: Row }) =>
    templateRows.find((row) => matchesWhere(row, where)) ?? undefined,
)

const db = {
  query: { templateModel: { findFirst } },
}
vi.mock("@chatbotx.io/database/client", () => ({ db, eq: vi.fn() }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateSelectableResourceRepository: {},
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  templateModel: {},
  templateInstallationModel: {},
}))

vi.mock("@chatbotx.io/flow-config", () => ({ parseTemplateExport: vi.fn() }))

vi.mock("@chatbotx.io/utils", () => ({ createId: vi.fn(() => "generated-id") }))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { installTemplate: "installTemplate" },
  defaultQueue: { add: vi.fn() },
}))

vi.mock("../src/workspace", () => ({
  workspaceService: { findOrFail: vi.fn(), findById: vi.fn() },
}))

vi.mock("../src/template/snapshot.service", () => ({
  buildTemplateSnapshot: vi.fn(),
}))

const { templateService } = await import("../src/template/service")

beforeEach(() => {
  findFirst.mockClear()
})

describe("templateService.findByIdOrFail — cross-workspace isolation (IDOR)", () => {
  test("resolves a template scoped to its own workspace", async () => {
    const template = await templateService.findByIdOrFail({
      workspaceId: "workspace-a",
      templateId: "template-a",
    })

    expect(template).toMatchObject({ id: "template-a" })
  })

  test("a template id that exists under a different workspace resolves not-found, never the other workspace's row", async () => {
    await expect(
      templateService.findByIdOrFail({
        workspaceId: "workspace-b",
        templateId: "template-a",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    // The lookup must have been attempted scoped by both id AND workspaceId
    // together — never id alone followed by an app-layer ownership check.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "template-a",
          workspaceId: "workspace-b",
        }),
      }),
    )
  })
})
