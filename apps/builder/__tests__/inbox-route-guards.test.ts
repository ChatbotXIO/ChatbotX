// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetCurrentUserAndTargetWorkspace, mockNotFound } = vi.hoisted(
  () => ({
    mockGetCurrentUserAndTargetWorkspace: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("not found")
    }),
  }),
)

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

vi.mock("@/lib/workspace/require-not-scheduled-for-deletion", () => ({
  enforceWorkspaceNotScheduledForDeletionFromRequest: vi.fn(
    async () => undefined,
  ),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
  })),
}))

vi.mock("@/features/chat/chat-layout", () => ({
  ChatLayout: () => null,
}))

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  ChatStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/custom-fields/provider/custom-field-store-context", () => ({
  CustomFieldStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/flows/provider/flow-store-context", () => ({
  FlowStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/inboxes/provider/inbox-store-context", () => ({
  InboxStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/saved-replies/provider/saved-reply-store-context", () => ({
  SavedReplyStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/sequences/provider/sequence-store-context", () => ({
  SequenceStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/tags/provider/tag-store-context", () => ({
  TagStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/users/provider/user-store-context", () => ({
  UserStoreProvider: ({ children }: { children: unknown }) => children,
}))

const { default: InboxPage } = await import(
  "../src/app/space/[workspaceId]/inbox/page"
)

const basePermissions = {
  superAdmin: false,
  analytics: false,
  flows: false,
  contacts: false,
  onlyAssignedContacts: false,
  emailAndPhone: false,
  broadcast: false,
  ecommerce: false,
}

describe("inbox route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allows assigned-only members to reach the inbox page", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          onlyAssignedContacts: true,
        },
      },
    })

    await expect(
      InboxPage({ params: Promise.resolve({ workspaceId: "ws-1" }) }),
    ).resolves.toBeDefined()

    expect(mockNotFound).not.toHaveBeenCalled()
  })

  test("rejects members without full or assigned-only contact access", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: basePermissions,
      },
    })

    await expect(
      InboxPage({ params: Promise.resolve({ workspaceId: "ws-1" }) }),
    ).rejects.toThrow("not found")

    expect(mockNotFound).toHaveBeenCalled()
  })
})
