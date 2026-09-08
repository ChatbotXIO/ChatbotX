// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockResend,
  mockAssertResendable,
  mockFindContactFilter,
  mockGetCurrentUserAndTargetWorkspace,
} = vi.hoisted(() => ({
  mockResend: vi.fn(),
  mockAssertResendable: vi.fn().mockResolvedValue({ id: "bc-1" }),
  mockFindContactFilter: vi.fn(),
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
  broadcastService: {
    resend: mockResend,
    assertResendable: mockAssertResendable,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: { findContactFilter: mockFindContactFilter },
}))

vi.mock("@chatbotx.io/database/queries/contact-filter/permission", () => ({
  pruneEmailPhoneFilterConditions: (contactFilter: unknown) =>
    contactFilter ?? undefined,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@/features/contacts/permissions", () => ({
  canViewContactEmailAndPhone: vi.fn(() => true),
}))

vi.mock("@/features/contact-filter/schema", () => ({
  contactFilterCriteriaSchema: {
    safeParse: (value: unknown) => ({ success: true, data: value }),
  },
}))

const { resendBroadcast } = await import(
  "../src/features/broadcasts/actions/resend-broadcast.action"
)

const WORKSPACE_ID = "ws-1"
const BROADCAST_ID = "bc-1"

describe("resendBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAssertResendable.mockResolvedValue({ id: BROADCAST_ID })
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: { permissions: ["emailAndPhone"] },
    })
    mockFindContactFilter.mockResolvedValue({ contactFilter: null })
  })

  test("reads the source broadcast's contact filter and delegates to broadcastService.resend", async () => {
    mockResend.mockResolvedValue({ id: "new-bc-id" })
    mockFindContactFilter.mockResolvedValue({
      contactFilter: { operator: "and", conditions: [] },
    })

    const result = await resendBroadcast({
      workspaceId: WORKSPACE_ID,
      id: BROADCAST_ID,
    })

    expect(mockFindContactFilter).toHaveBeenCalledWith({
      id: BROADCAST_ID,
      workspaceId: WORKSPACE_ID,
    })
    expect(mockResend).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: BROADCAST_ID,
      contactFilter: { operator: "and", conditions: [] },
    })
    expect(result).toEqual({ id: "new-bc-id" })
  })

  test("propagates a 'Broadcast is not sent' error from assertResendable, before reading the contact filter", async () => {
    mockAssertResendable.mockRejectedValue(new Error("Broadcast is not sent"))

    await expect(
      resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID }),
    ).rejects.toThrow("Broadcast is not sent")

    // The guard runs before the contact-filter read — a not-resendable
    // broadcast's filter is never touched.
    expect(mockFindContactFilter).not.toHaveBeenCalled()
    expect(mockResend).not.toHaveBeenCalled()
  })

  test("propagates a not-found error when the source broadcast is missing, before reading the contact filter", async () => {
    mockAssertResendable.mockRejectedValue(new Error("Record not found"))

    await expect(
      resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID }),
    ).rejects.toThrow("Record not found")

    expect(mockFindContactFilter).not.toHaveBeenCalled()
    expect(mockResend).not.toHaveBeenCalled()
  })

  test("passes undefined contactFilter when the source has none stored", async () => {
    mockResend.mockResolvedValue({ id: "new-bc-id" })
    mockFindContactFilter.mockResolvedValue(undefined)

    await resendBroadcast({ workspaceId: WORKSPACE_ID, id: BROADCAST_ID })

    expect(mockResend).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      id: BROADCAST_ID,
      contactFilter: undefined,
    })
  })
})
