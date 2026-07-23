// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"

const mockGetCurrentUserAndTargetWorkspace = vi.fn()
const mockHasWorkspacePermission = vi.fn()
const mockScheduleDeletion = vi.fn()
const mockCancelInFlightCampaigns = vi.fn()
const mockRedirect = vi.fn(() => {
  throw new Error("redirect")
})

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClientAllowExpired: chain,
  }
})

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: mockHasWorkspacePermission,
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceLifecycleService: {
    cancelInFlightCampaigns: mockCancelInFlightCampaigns,
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
  mockCancelInFlightCampaigns.mockResolvedValue([])
})

test("schedules deletion then cancels in-flight campaigns before redirecting", async () => {
  await expect(
    (scheduleWorkspaceDeletionAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1"],
    }),
  ).rejects.toThrow("redirect")

  expect(mockScheduleDeletion).toHaveBeenCalledWith({ id: "workspace-1" })
  expect(mockCancelInFlightCampaigns).toHaveBeenCalledWith("workspace-1")
  expect(mockRedirect).toHaveBeenCalledWith("/")
})
