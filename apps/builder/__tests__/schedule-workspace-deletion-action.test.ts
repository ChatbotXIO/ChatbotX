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

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
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
    user: { id: "user-1" },
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

  expect(mockScheduleDeletion).toHaveBeenCalledWith({
    actorId: "user-1",
    id: "workspace-1",
  })
})
