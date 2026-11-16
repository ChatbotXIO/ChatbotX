// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

// `resolveConnectOwnerId` gates a direct (token/credential) channel connect by
// a signed-in user (LINE, Telegram). Connecting into an existing workspace must
// pass the same gates as `workspaceActionClient`: access, pending deletion and
// the owner's trial/MAC block (AGENTS.md invariant 14).

const {
  checkWorkspaceOwnerAccessMock,
  findWorkspaceMock,
  getAccessStateMock,
  hasWorkspaceAccessMock,
  isScheduledForDeletionMock,
} = vi.hoisted(() => ({
  checkWorkspaceOwnerAccessMock: vi.fn(),
  findWorkspaceMock: vi.fn(),
  getAccessStateMock: vi.fn(),
  hasWorkspaceAccessMock: vi.fn(),
  isScheduledForDeletionMock: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  hasWorkspaceAccess: hasWorkspaceAccessMock,
  isWorkspaceScheduledForDeletion: isScheduledForDeletionMock,
  userQuotaService: { getAccessState: getAccessStateMock },
  workspaceService: { findOrFail: findWorkspaceMock },
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

// Fully replaced: the real module pulls in `@/env`'s deployment variables.
vi.mock("@/lib/workspace/authorize-workspace-access", () => ({
  checkWorkspaceOwnerAccess: checkWorkspaceOwnerAccessMock,
  workspaceAccessDenialException: (
    reason: "trialExpired" | "macLimitReached",
  ) => new ChatbotXException(`denied: ${reason}`, reason, 403),
}))

import { resolveConnectOwnerId } from "@/features/channel-connect/lib/resolve-connect-owner"

const user = { id: "user-1" } as never
const workspace = { id: "ws-1", ownerId: "owner-1" }

describe("resolveConnectOwnerId into an existing workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasWorkspaceAccessMock.mockResolvedValue(true)
    findWorkspaceMock.mockResolvedValue(workspace)
    isScheduledForDeletionMock.mockReturnValue(false)
    checkWorkspaceOwnerAccessMock.mockResolvedValue(null)
  })

  test("returns the workspace owner when every gate passes", async () => {
    await expect(
      resolveConnectOwnerId({ workspaceId: "ws-1", user }),
    ).resolves.toBe("owner-1")
    expect(checkWorkspaceOwnerAccessMock).toHaveBeenCalledWith({
      ownerId: "owner-1",
    })
  })

  test("refuses a user without access", async () => {
    hasWorkspaceAccessMock.mockResolvedValue(false)

    await expect(
      resolveConnectOwnerId({ workspaceId: "ws-1", user }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("refuses a workspace scheduled for deletion", async () => {
    isScheduledForDeletionMock.mockReturnValue(true)

    await expect(
      resolveConnectOwnerId({ workspaceId: "ws-1", user }),
    ).rejects.toMatchObject({ code: "workspaceScheduledDeletion" })
  })

  test.each([
    "trialExpired",
    "macLimitReached",
  ] as const)("refuses when the owner is blocked (%s)", async (reason) => {
    checkWorkspaceOwnerAccessMock.mockResolvedValue(reason)

    await expect(
      resolveConnectOwnerId({ workspaceId: "ws-1", user }),
    ).rejects.toMatchObject({ code: reason })
  })
})

describe("resolveConnectOwnerId for a new workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("uses the creating user's own quota, not a workspace gate", async () => {
    getAccessStateMock.mockResolvedValue({ blocked: false })

    await expect(
      resolveConnectOwnerId({ workspaceId: undefined, user }),
    ).resolves.toBe("user-1")
    expect(checkWorkspaceOwnerAccessMock).not.toHaveBeenCalled()
  })

  test("refuses a trial-expired user", async () => {
    getAccessStateMock.mockResolvedValue({ blocked: true, reason: "trial" })

    await expect(
      resolveConnectOwnerId({ workspaceId: undefined, user }),
    ).rejects.toMatchObject({ code: "trialExpired" })
  })
})
