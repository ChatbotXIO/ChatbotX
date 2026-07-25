import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLoggerInfo, mockGetAccessState, mockWorkspaceFind, mockIsCloud } =
  vi.hoisted(() => ({
    mockLoggerInfo: vi.fn(),
    mockGetAccessState: vi.fn(),
    mockWorkspaceFind: vi.fn(),
    mockIsCloud: vi.fn(),
  }))

vi.mock("../src/logger", () => ({
  logger: {
    info: mockLoggerInfo,
  },
}))

vi.mock("../src/keys", () => ({
  isCloud: mockIsCloud,
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
    mockIsCloud.mockReturnValue(true)
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

  test("skips the callback when the workspace row no longer exists", async () => {
    mockWorkspaceFind.mockResolvedValue(undefined)
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe(
      undefined,
    )

    expect(fn).not.toHaveBeenCalled()
    expect(mockGetAccessState).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      {
        freezeReason: "missingWorkspace",
        ownerId: undefined,
        workspaceId: "workspace-1",
      },
      "Skipping workspace job for frozen workspace",
    )
  })

  test("never reads owner quota on non-cloud editions, where no owner can be entitlement-blocked", async () => {
    mockIsCloud.mockReturnValue(false)
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe("ran")

    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockGetAccessState).not.toHaveBeenCalled()
  })

  test("still skips a workspace scheduled for deletion on non-cloud editions", async () => {
    mockIsCloud.mockReturnValue(false)
    mockWorkspaceFind.mockResolvedValue({
      ...workspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe(
      undefined,
    )

    expect(fn).not.toHaveBeenCalled()
    expect(mockGetAccessState).not.toHaveBeenCalled()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      {
        freezeReason: "scheduledForDeletion",
        ownerId: "owner-1",
        workspaceId: "workspace-1",
      },
      "Skipping workspace job for frozen workspace",
    )
  })

  test("skips a workspace scheduled for deletion without consulting quota, so a quota fault cannot break the deletion freeze", async () => {
    mockWorkspaceFind.mockResolvedValue({
      ...workspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })
    mockGetAccessState.mockRejectedValue(new Error("quota read exploded"))
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard("workspace-1", fn)).resolves.toBe(
      undefined,
    )

    expect(fn).not.toHaveBeenCalled()
    expect(mockGetAccessState).not.toHaveBeenCalled()
  })

  test("keeps fail-open behavior when no workspace id is available", async () => {
    const fn = vi.fn(async () => "ran")

    await expect(withBlockedOwnerGuard(undefined, fn)).resolves.toBe("ran")

    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockWorkspaceFind).not.toHaveBeenCalled()
    expect(mockGetAccessState).not.toHaveBeenCalled()
  })
})
