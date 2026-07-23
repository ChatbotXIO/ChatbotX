import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLoggerInfo, mockGetAccessState, mockWorkspaceFind } = vi.hoisted(
  () => ({
    mockLoggerInfo: vi.fn(),
    mockGetAccessState: vi.fn(),
    mockWorkspaceFind: vi.fn(),
  }),
)

vi.mock("../src/logger", () => ({
  logger: {
    info: mockLoggerInfo,
  },
}))

vi.mock("../src/user-quota/service", () => ({
  userQuotaService: {
    getAccessState: mockGetAccessState,
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: {
    find: mockWorkspaceFind,
  },
}))

const { withBlockedOwnerGuard } = await import(
  "../src/workspace-lifecycle/with-blocked-owner-guard"
)

const allowedAccessState = {
  blocked: false,
  planName: "Trial",
  status: "trial",
  trialEndsAt: null,
}

const blockedAccessState = {
  ...allowedAccessState,
  blocked: true,
}

const workspace = {
  id: "workspace-1",
  ownerId: "owner-1",
  scheduledDeletionAt: null,
}

describe("withBlockedOwnerGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceFind.mockResolvedValue(workspace)
    mockGetAccessState.mockResolvedValue(allowedAccessState)
  })

  test("runs the callback when the workspace is not scheduled for deletion and the owner is not blocked", async () => {
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe("ran")

    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockLoggerInfo).not.toHaveBeenCalled()
  })

  test("skips the callback when the workspace is scheduled for deletion", async () => {
    mockWorkspaceFind.mockResolvedValue({
      ...workspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe(
      undefined,
    )

    expect(fn).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      {
        freezeReason: "scheduledForDeletion",
        ownerId: "owner-1",
        workspaceId: "workspace-1",
      },
      "Skipping workspace job for frozen workspace",
    )
  })

  test("skips the callback when the owner is blocked", async () => {
    mockGetAccessState.mockResolvedValue(blockedAccessState)
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe(
      undefined,
    )

    expect(fn).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      {
        freezeReason: "ownerBlocked",
        ownerId: "owner-1",
        workspaceId: "workspace-1",
      },
      "Skipping workspace job for frozen workspace",
    )
  })

  test("keeps fail-open behavior when no workspace id is available", async () => {
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard(undefined, fn)).resolves.toBe("ran")

    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockWorkspaceFind).not.toHaveBeenCalled()
    expect(mockGetAccessState).not.toHaveBeenCalled()
  })
})
