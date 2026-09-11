// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockResendWithPruning, mockGetCurrentUserAndTargetWorkspace } =
  vi.hoisted(() => ({
    mockResendWithPruning: vi.fn(),
    mockGetCurrentUserAndTargetWorkspace: vi.fn().mockResolvedValue({
      targetWorkspaceMember: { permissions: ["emailAndPhone"] },
    }),
  }))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: { resendWithPruning: mockResendWithPruning },
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: vi.fn(() => true),
}))

const { resendBroadcastAction: resendBroadcastActionUntyped } = await import(
  "../src/features/broadcasts/actions/resend-broadcast.action"
)

type Handler = (props: unknown) => Promise<unknown>
const resendBroadcastAction = resendBroadcastActionUntyped as unknown as Handler

const WORKSPACE_ID = "ws-1"
const BROADCAST_ID = "bc-1"

describe("resendBroadcastAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: { permissions: ["emailAndPhone"] },
    })
  })

  test("delegates to broadcastService.resendWithPruning with the caller's canViewEmailAndPhone", async () => {
    mockResendWithPruning.mockResolvedValue({ id: "new-bc-id" })

    const result = await resendBroadcastAction({
      bindArgsParsedInputs: [WORKSPACE_ID, BROADCAST_ID],
    })

    expect(mockResendWithPruning).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: BROADCAST_ID,
      canViewEmailAndPhone: true,
    })
    expect(result).toEqual({ id: "new-bc-id" })
  })

  test("passes canViewEmailAndPhone: false when there is no current user/workspace", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue(null)
    mockResendWithPruning.mockResolvedValue({ id: "new-bc-id" })

    await resendBroadcastAction({
      bindArgsParsedInputs: [WORKSPACE_ID, BROADCAST_ID],
    })

    expect(mockResendWithPruning).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: BROADCAST_ID,
      canViewEmailAndPhone: false,
    })
  })

  test("propagates an error from resendWithPruning", async () => {
    mockResendWithPruning.mockRejectedValue(new Error("Broadcast is not sent"))

    await expect(
      resendBroadcastAction({
        bindArgsParsedInputs: [WORKSPACE_ID, BROADCAST_ID],
      }),
    ).rejects.toThrow("Broadcast is not sent")
  })
})
