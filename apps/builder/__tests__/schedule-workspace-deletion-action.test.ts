// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"

const mockGetCurrentUserAndTargetWorkspace = vi.fn()
const mockHasWorkspacePermission = vi.fn()
const mockScheduleDeletion = vi.fn()

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
})

test("schedules a reversible workspace deletion grace period", async () => {
  await (
    scheduleWorkspaceDeletionAction as (props: unknown) => Promise<unknown>
  )({
    bindArgsParsedInputs: ["workspace-1"],
  })

  expect(mockScheduleDeletion).toHaveBeenCalledWith({ id: "workspace-1" })
})
