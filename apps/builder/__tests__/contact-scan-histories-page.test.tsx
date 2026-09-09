// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const mockNotFound = vi.fn(() => {
  throw new Error("notFound")
})
vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireContactsAccess: vi.fn(),
}))

vi.mock("@/features/contact-scan/lib/require-contact-scan-page-access", () => ({
  requireContactScanPageAccess: vi.fn(),
}))

vi.mock(
  "@/features/contact-scan/queries/list-contact-scan-history.queries",
  () => ({
    listContactScanHistory: vi.fn(),
  }),
)

vi.mock(
  "@/features/contact-scan/components/contact-scan-history-table",
  () => ({
    ContactScanHistoryTable: () => <div data-testid="history-table" />,
  }),
)

const { requireContactsAccess } = await import(
  "@/lib/auth/require-workspace-permission"
)
const { requireContactScanPageAccess } = await import(
  "@/features/contact-scan/lib/require-contact-scan-page-access"
)
const { listContactScanHistory } = await import(
  "@/features/contact-scan/queries/list-contact-scan-history.queries"
)
const { default: ContactScanHistoriesPage } = await import(
  "@/app/space/[workspaceId]/contacts/scan/histories/page"
)

describe("ContactScanHistoriesPage", () => {
  beforeEach(() => {
    vi.mocked(requireContactsAccess).mockReset().mockResolvedValue(undefined)
    vi.mocked(requireContactScanPageAccess)
      .mockReset()
      .mockResolvedValue(undefined)
    vi.mocked(listContactScanHistory)
      .mockReset()
      .mockResolvedValue({ data: [], pageCount: 0 })
    mockNotFound.mockClear()
  })

  test("renders the back link, heading, and history table for an unrestricted member", async () => {
    const element = await ContactScanHistoriesPage({
      params: Promise.resolve({ workspaceId: "1" }),
      searchParams: Promise.resolve({}),
    })

    const html = renderToStaticMarkup(element)

    expect(requireContactsAccess).toHaveBeenCalledWith("1")
    expect(requireContactScanPageAccess).toHaveBeenCalledWith("1")
    expect(listContactScanHistory).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1" }),
    )
    expect(html).toContain("contactScan.histories.title")
    expect(html).toContain('href="/space/1/contacts/scan"')
    expect(html).toContain('data-testid="history-table"')
  })

  test("propagates notFound for a restricted (assigned-only) member without listing history", async () => {
    vi.mocked(requireContactScanPageAccess).mockImplementation(() => {
      mockNotFound()
      return Promise.resolve()
    })

    await expect(
      ContactScanHistoriesPage({
        params: Promise.resolve({ workspaceId: "1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("notFound")

    expect(listContactScanHistory).not.toHaveBeenCalled()
  })
})
