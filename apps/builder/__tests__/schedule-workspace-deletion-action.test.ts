// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"

const mockGetCurrentUserAndTargetWorkspace = vi.fn()
const mockHasWorkspacePermission = vi.fn()
const mockScheduleDeletion = vi.fn()
const mockFreezeWorkspaceRuntime = vi.fn()

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClientAllowExpired: chain,
  }
})

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: mockHasWorkspacePermission,
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceLifecycleService: {
    freezeWorkspaceRuntime: mockFreezeWorkspaceRuntime,
  },
  workspaceService: {
    scheduleDeletion: mockScheduleDeletion,
  },
}))

const { scheduleWorkspaceDeletionAction } = await import(
  "../src/features/workspaces/actions/schedule-workspace-deletion-action"
)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
    targetWorkspaceMember: {
      permissions: { superAdmin: true },
    },
  })
  mockHasWorkspacePermission.mockReturnValue(true)
  mockScheduleDeletion.mockResolvedValue(undefined)
  mockFreezeWorkspaceRuntime.mockResolvedValue(undefined)
})

test("schedules deletion then freezes the workspace runtime", async () => {
  await (
    scheduleWorkspaceDeletionAction as (props: unknown) => Promise<unknown>
  )({
    bindArgsParsedInputs: ["workspace-1"],
  })

  expect(mockScheduleDeletion).toHaveBeenCalledWith({ id: "workspace-1" })
  expect(mockFreezeWorkspaceRuntime).toHaveBeenCalledWith("workspace-1")
})
