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

vi.mock("@/features/automated-response/keywords-tab", () => ({
  KeywordsTab: () => null,
}))

vi.mock("@/features/automated-response/keywords-description", () => ({
  KeywordsDescription: () => null,
}))

vi.mock("@/features/flows/provider/flow-store-context", () => ({
  FlowStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/folders/provider/folder-store-context", () => ({
  FolderStoreProvider: ({ children }: { children: unknown }) => children,
}))

const { default: PageAutomatedResponsesFolderableLayout } = await import(
  "../src/app/space/[workspaceId]/(has-folder)/page-automated-responses/layout"
)
const { default: PageAutomatedResponsesLayout } = await import(
  "../src/app/space/[workspaceId]/page-automated-responses/layout"
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

describe("page-automated-responses route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allows super admins to reach the outbound keywords layouts", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          superAdmin: true,
        },
      },
    })

    await expect(
      PageAutomatedResponsesFolderableLayout({
        children: null,
        folders: null,
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).resolves.toBeDefined()
    await expect(
      PageAutomatedResponsesLayout({
        children: null,
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).resolves.toBeDefined()

    expect(mockNotFound).not.toHaveBeenCalled()
  })

  test("rejects fully-permissioned non-super-admins on the outbound keywords layouts", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: true,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
      },
    })

    await expect(
      PageAutomatedResponsesFolderableLayout({
        children: null,
        folders: null,
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).rejects.toThrow("not found")
    await expect(
      PageAutomatedResponsesLayout({
        children: null,
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).rejects.toThrow("not found")

    expect(mockNotFound).toHaveBeenCalled()
  })
})
