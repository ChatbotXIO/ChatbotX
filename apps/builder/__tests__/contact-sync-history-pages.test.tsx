// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const mockNotFound = vi.fn(() => {
  throw new Error("notFound")
})
vi.mock("next/navigation", () => ({ notFound: mockNotFound }))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode
    href: string
  }) => <a href={href}>{children}</a>,
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireContactsAccess: vi.fn(),
}))
vi.mock("@/features/contact-scan/lib/require-contact-scan-page-access", () => ({
  requireContactScanPageAccess: vi.fn(),
}))

const getRun = vi.hoisted(() => vi.fn())
vi.mock("@chatbotx.io/business", () => ({
  contactSyncService: { get: getRun },
}))

vi.mock(
  "@/features/contact-sync/queries/list-contact-sync-history.queries",
  () => ({ listContactSyncHistory: vi.fn() }),
)
vi.mock(
  "@/features/contact-sync/components/contact-sync-history-table",
  () => ({
    ContactSyncHistoryTable: ({ workspaceId }: { workspaceId: string }) => (
      <div data-testid="history-table" data-workspace={workspaceId} />
    ),
  }),
)
vi.mock("@/features/contact-sync/components/contact-sync-progress", () => ({
  ContactSyncProgress: ({ runId }: { runId: string }) => (
    <div data-run={runId} data-testid="progress" />
  ),
}))

const { requireContactsAccess } = await import(
  "@/lib/auth/require-workspace-permission"
)
const { requireContactScanPageAccess } = await import(
  "@/features/contact-scan/lib/require-contact-scan-page-access"
)
const { listContactSyncHistory } = await import(
  "@/features/contact-sync/queries/list-contact-sync-history.queries"
)
const { default: ContactSyncHistoriesPage } = await import(
  "@/app/space/[workspaceId]/contacts/sync/histories/page"
)
const { default: ContactSyncRunPage } = await import(
  "@/app/space/[workspaceId]/contacts/sync/histories/[runId]/page"
)

beforeEach(() => {
  vi.mocked(requireContactsAccess).mockReset().mockResolvedValue({
    canViewEmailAndPhone: true,
  })
  vi.mocked(requireContactScanPageAccess)
    .mockReset()
    .mockResolvedValue(undefined)
  vi.mocked(listContactSyncHistory)
    .mockReset()
    .mockResolvedValue({ data: [], total: 0, pageCount: 0 })
  getRun.mockReset().mockResolvedValue({ id: "7" })
  mockNotFound.mockClear()
})

describe("ContactSyncHistoriesPage", () => {
  test("lists the workspace's runs behind the contacts and sync gates", async () => {
    const element = await ContactSyncHistoriesPage({
      params: Promise.resolve({ workspaceId: "1" }),
      searchParams: Promise.resolve({ page: "2" }),
    })

    const html = renderToStaticMarkup(element)

    expect(requireContactsAccess).toHaveBeenCalledWith("1")
    expect(requireContactScanPageAccess).toHaveBeenCalledWith("1")
    expect(listContactSyncHistory).toHaveBeenCalledWith({
      workspaceId: "1",
      page: 2,
      perPage: 10,
    })
    expect(html).toContain("contactSync.history.title")
    expect(html).toContain('href="/space/1/contacts"')
    expect(html).toContain('data-testid="history-table"')
  })

  test("an assigned-only member gets a 404 and nothing is listed", async () => {
    vi.mocked(requireContactScanPageAccess).mockImplementation(() => {
      mockNotFound()
      return Promise.resolve()
    })

    await expect(
      ContactSyncHistoriesPage({
        params: Promise.resolve({ workspaceId: "1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("notFound")
    expect(listContactSyncHistory).not.toHaveBeenCalled()
  })
})

describe("ContactSyncRunPage", () => {
  test("shows the run's progress with a link back to the history", async () => {
    const element = await ContactSyncRunPage({
      params: Promise.resolve({ workspaceId: "1", runId: "7" }),
    })

    const html = renderToStaticMarkup(element)

    expect(getRun).toHaveBeenCalledWith({ workspaceId: "1", runId: "7" })
    expect(html).toContain('data-run="7"')
    expect(html).toContain('href="/space/1/contacts/sync/histories"')
  })

  test("a run id that is not a number is a 404 before any read", async () => {
    await expect(
      ContactSyncRunPage({
        params: Promise.resolve({ workspaceId: "1", runId: "abc" }),
      }),
    ).rejects.toThrow("notFound")
    expect(getRun).not.toHaveBeenCalled()
  })

  test("a run id past the bigint range is a 404 before any read", async () => {
    await expect(
      ContactSyncRunPage({
        params: Promise.resolve({
          workspaceId: "1",
          runId: "9223372036854775808",
        }),
      }),
    ).rejects.toThrow("notFound")
    expect(getRun).not.toHaveBeenCalled()
  })

  test("a run of another workspace (or none) is a 404", async () => {
    getRun.mockRejectedValue(
      new ChatbotXException(
        "Contact sync not found",
        "contactSyncRunNotFound",
        404,
      ),
    )

    await expect(
      ContactSyncRunPage({
        params: Promise.resolve({ workspaceId: "1", runId: "7" }),
      }),
    ).rejects.toThrow("notFound")
  })

  test("an unexpected failure is not hidden as a 404", async () => {
    getRun.mockRejectedValue(new Error("database down"))

    await expect(
      ContactSyncRunPage({
        params: Promise.resolve({ workspaceId: "1", runId: "7" }),
      }),
    ).rejects.toThrow("database down")
    expect(mockNotFound).not.toHaveBeenCalled()
  })
})
