// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const deleteMeData = vi.fn()
const loadServableWorkspace = vi.fn()

vi.mock("@chatbotx.io/business/system-field", () => ({
  systemFieldService: {
    deleteMeData,
  },
}))

vi.mock("@/lib/safe-action", () => ({
  actionClient: {
    inputSchema: () => ({
      action: () => ({}),
    }),
  },
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace,
}))

const { handleDeleteMeData } = await import(
  "../src/features/system-fields/actions/delete-me-data.action"
)

describe("delete me data action", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadServableWorkspace.mockResolvedValue({ servable: true })
  })

  test("maps public link params to the business erasure service", async () => {
    await expect(
      handleDeleteMeData({
        parsedInput: {
          w: "workspace-1",
          u: "source-1",
          ib: "integration-1",
          id: "form-1",
          hash: "hash-1",
        },
      }),
    ).resolves.toBeNull()

    expect(deleteMeData).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sourceId: "source-1",
      integrationId: "integration-1",
      formId: "form-1",
      hash: "hash-1",
    })
  })

  test("rejects without deleting data when the workspace is scheduled for deletion", async () => {
    loadServableWorkspace.mockResolvedValue({ servable: false })

    await expect(
      handleDeleteMeData({
        parsedInput: {
          w: "workspace-1",
          u: "source-1",
          ib: "integration-1",
          id: "form-1",
          hash: "hash-1",
        },
      }),
    ).rejects.toMatchObject({
      code: "workspaceScheduledDeletion",
      httpStatusCode: 403,
    })

    expect(deleteMeData).not.toHaveBeenCalled()
  })
})
