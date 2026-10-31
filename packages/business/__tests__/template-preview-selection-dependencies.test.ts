// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ previewDependencies: vi.fn() }))

vi.mock("../src/template/install-preview", () => mocks)

const { previewSelectionDependencies } = await import(
  "../src/template/preview-selection-dependencies"
)

const selection = { flows: { mode: "ids", ids: ["5"] } } as const
const base = { workspaceId: "1", tenantId: "1", selection }

describe("previewSelectionDependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.previewDependencies.mockResolvedValue({
      includedDependencies: [
        { category: "sequences", sourceId: "9", name: "Drip" },
      ],
      manifests: [],
      droppedReferenceCount: 0,
      categoryCounts: { flows: 1, sequences: 1 },
    })
  })

  test("lets a read_only token preview, without the internal counts", async () => {
    const result = await previewSelectionDependencies({
      ...base,
      actor: { kind: "apiToken", permission: "read_only" },
    })
    expect(result).not.toHaveProperty("categoryCounts")
    expect(result.includedDependencies).toHaveLength(1)
  })

  test("refuses a member whose pulled-in rows are in a category they can not use", async () => {
    await expect(
      previewSelectionDependencies({
        ...base,
        actor: { kind: "member", permissions: { flows: true } },
      }),
    ).rejects.toMatchObject({ code: "templateCategoryPermissionDenied" })
  })

  test("refuses a member without the manage permission before reading anything", async () => {
    await expect(
      previewSelectionDependencies({
        ...base,
        actor: { kind: "member", permissions: { ecommerce: true } },
      }),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mocks.previewDependencies).not.toHaveBeenCalled()
  })
})
