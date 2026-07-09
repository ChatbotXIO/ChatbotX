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

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@/features/contacts/queries/list-contacts.queries", () => ({
  listContactsRSC: vi.fn(async () => ({ data: [], pageCount: 0 })),
}))

vi.mock("@/features/contacts/schemas/query", () => ({
  listContactsRequest: {
    omit: () => ({
      safeParse: () => ({ data: {} }),
    }),
  },
}))

vi.mock("@/features/import/queries/list-imports.queries", () => ({
  listImports: vi.fn(async () => ({ data: [], pageCount: 0 })),
}))

vi.mock("@/features/import/schemas/query", () => ({
  listImportsSearchParamsCache: {
    parse: () => ({}),
  },
}))

vi.mock("@/features/contacts/contacts-table", () => ({
  ContactsTable: () => null,
}))

vi.mock("@/features/contacts/import-contact-form", () => ({
  ImportContactsForm: () => null,
}))

vi.mock("@/features/import/components/import-form", () => ({
  ImportForm: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/import/components/import-history-table", () => ({
  ImportHistoryTable: () => null,
}))

vi.mock("@/features/custom-fields/provider/custom-field-store-context", () => ({
  CustomFieldStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/inboxes/provider/inbox-store-context", () => ({
  InboxStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/tags/provider/tag-store-context", () => ({
  TagStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/users/provider/user-store-context", () => ({
  UserStoreProvider: ({ children }: { children: unknown }) => children,
}))

const { default: ContactsPage } = await import(
  "../src/app/space/[workspaceId]/contacts/page"
)
const { default: ImportContactsPage } = await import(
  "../src/app/(no-sidebar)/space/[workspaceId]/contacts/import/page"
)
const { default: ImportContactsHistoriesPage } = await import(
  "../src/app/(no-sidebar)/space/[workspaceId]/contacts/import/histories/page"
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

describe("contacts route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allows assigned-only members to reach contacts and contacts import pages", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          onlyAssignedContacts: true,
        },
      },
    })

    await expect(
      ContactsPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toBeDefined()
    await expect(
      ImportContactsPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).resolves.toBeDefined()
    await expect(
      ImportContactsHistoriesPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).resolves.toBeDefined()
  })

  test("rejects members without full or assigned-only contact access on contacts routes", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: basePermissions,
      },
    })

    await expect(
      ContactsPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")
    await expect(
      ImportContactsPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).rejects.toThrow("not found")
    await expect(
      ImportContactsHistoriesPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("not found")
  })
})
