// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockWorkspaceFind } = vi.hoisted(() => ({
  mockWorkspaceFind: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const predicates = await import(
    "@chatbotx.io/business/workspace-lifecycle/predicates"
  )
  return {
    ...predicates,
    workspaceService: {
      find: mockWorkspaceFind,
    },
  }
})

const { loadServableWorkspace } = await import(
  "../src/lib/workspace/load-servable-workspace"
)

describe("loadServableWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns servable false when the workspace is scheduled for deletion", async () => {
    const workspace = {
      id: "workspace-1",
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    }
    mockWorkspaceFind.mockResolvedValue(workspace)

    await expect(loadServableWorkspace("workspace-1")).resolves.toEqual({
      servable: false,
      workspace,
    })
  })

  test("returns servable true when the workspace is not scheduled for deletion", async () => {
    const workspace = { id: "workspace-1", scheduledDeletionAt: null }
    mockWorkspaceFind.mockResolvedValue(workspace)

    await expect(loadServableWorkspace("workspace-1")).resolves.toEqual({
      servable: true,
      workspace,
    })
  })

  test("returns servable false when the workspace no longer exists", async () => {
    mockWorkspaceFind.mockResolvedValue(undefined)

    await expect(loadServableWorkspace("workspace-1")).resolves.toEqual({
      servable: false,
      workspace: undefined,
    })
  })
})
