// @vitest-environment node
import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockContactUnsubscribeEmail,
  mockEmit,
  mockLoadServableWorkspace,
  mockMagicLinkFindFirst,
  mockNotFound,
  mockQrCodeFind,
  mockResolveTenantSettings,
  mockSystemGetMePrivacyData,
  mockVerifyUnsubscribeToken,
} = vi.hoisted(() => ({
  mockContactUnsubscribeEmail: vi.fn(),
  mockEmit: vi.fn(),
  mockLoadServableWorkspace: vi.fn(),
  mockMagicLinkFindFirst: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("notFound")
  }),
  mockQrCodeFind: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
  mockSystemGetMePrivacyData: vi.fn(),
  mockVerifyUnsubscribeToken: vi.fn(),
}))

vi.mock("@/lib/workspace/load-servable-workspace", () => ({
  loadServableWorkspace: mockLoadServableWorkspace,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      magicLinkModel: { findFirst: mockMagicLinkFindFirst },
    },
  },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mockEmit,
}))

vi.mock("@chatbotx.io/business", () => ({
  contactService: {
    unsubscribeEmail: mockContactUnsubscribeEmail,
  },
  inboxService: {
    list: vi.fn(),
  },
  qrCodeService: {
    find: mockQrCodeFind,
  },
  resolveTenantSettings: mockResolveTenantSettings,
  verifyUnsubscribeToken: mockVerifyUnsubscribeToken,
}))

vi.mock("@chatbotx.io/business/system-field", () => ({
  systemFieldService: {
    getMePrivacyData: mockSystemGetMePrivacyData,
  },
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getInboxLinks: vi.fn(() => []),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    getIdFromParams: (params: Record<string, string>, key: string) =>
      params[key],
  }
})

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: vi.fn(),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/inboxes/components/landing-inbox-list", () => ({
  InboxListLandingPage: () => null,
}))

vi.mock("@/features/system-fields/components/me-data-view", () => ({
  MeDataView: () => null,
}))

vi.mock("@/i18n/workspace-locale", () => ({
  loadWorkspaceMessages: vi.fn(async () => ({ locale: "en", messages: {} })),
}))

const { GET: getMagicLink } = await import(
  "../src/app/r/[workspaceId]/[name]/route"
)
const { default: LandingPage } = await import(
  "../src/app/l/[workspaceId]/[id]/page"
)
const { default: MePage } = await import("../src/app/extensions/me/page")
const { default: UnsubscribePage } = await import("../src/app/unsubscribe/page")

describe("public scheduled-deletion route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadServableWorkspace.mockResolvedValue({ servable: true })
    mockResolveTenantSettings.mockResolvedValue({
      appUrl: "https://app.example.com",
    })
    mockVerifyUnsubscribeToken.mockResolvedValue({
      cid: "contact-1",
      wid: "workspace-1",
    })
  })

  test("magiclink returns 410 before lookup, emit, or redirect when the workspace is scheduled for deletion", async () => {
    mockLoadServableWorkspace.mockResolvedValue({ servable: false })

    const response = await getMagicLink(
      new Request(
        "http://localhost/r/workspace-1/link",
      ) as unknown as NextRequest,
      { params: Promise.resolve({ workspaceId: "workspace-1", name: "link" }) },
    )

    expect(response.status).toBe(410)
    expect(mockMagicLinkFindFirst).not.toHaveBeenCalled()
    expect(mockEmit).not.toHaveBeenCalled()
  })

  test("QR landing returns notFound before resolving channels when the workspace is scheduled for deletion", async () => {
    mockLoadServableWorkspace.mockResolvedValue({ servable: false })

    await expect(
      LandingPage({
        params: Promise.resolve({ workspaceId: "workspace-1", id: "qr-1" }),
      }),
    ).rejects.toThrow("notFound")

    expect(mockResolveTenantSettings).not.toHaveBeenCalled()
    expect(mockQrCodeFind).not.toHaveBeenCalled()
  })

  test("GDPR me page returns notFound before loading private data when the workspace is scheduled for deletion", async () => {
    mockLoadServableWorkspace.mockResolvedValue({ servable: false })

    await expect(
      MePage({
        searchParams: Promise.resolve({
          w: "workspace-1",
          u: "source-1",
          ib: "integration-1",
          id: "form-1",
          hash: "hash-1",
        }),
      }),
    ).rejects.toThrow("notFound")

    expect(mockSystemGetMePrivacyData).not.toHaveBeenCalled()
  })

  test("unsubscribe renders unavailable and skips mutation when the workspace is scheduled for deletion", async () => {
    mockLoadServableWorkspace.mockResolvedValue({ servable: false })

    const result = await UnsubscribePage({
      searchParams: Promise.resolve({ token: "token-1" }),
    })

    expect(JSON.stringify(result)).toContain("unavailableTitle")
    expect(mockContactUnsubscribeEmail).not.toHaveBeenCalled()
  })
})
