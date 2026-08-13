// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockResolveGuardedWorkspaceId,
  mockRequireWorkspacePermission,
  mockGetCurrentUserAndTargetWorkspace,
  mockGetCurrentUserId,
  mockNotFound,
  mockRedirect,
  mockInboxCardList,
} = vi.hoisted(() => ({
  mockResolveGuardedWorkspaceId: vi.fn(async () => "ws-1"),
  mockRequireWorkspacePermission: vi.fn(async () => undefined),
  mockGetCurrentUserAndTargetWorkspace: vi.fn(),
  mockGetCurrentUserId: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("not found")
  }),
  mockRedirect: vi.fn(),
  mockInboxCardList: vi.fn(() => null),
}))

vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: mockRequireWorkspacePermission,
  resolveGuardedWorkspaceId: mockResolveGuardedWorkspaceId,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
  getCurrentUserId: mockGetCurrentUserId,
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@chatbotx.io/analytics-nextjs/components/base-dashboard", () => ({
  BaseDashboard: () => null,
}))

vi.mock("@chatbotx.io/business", () => ({
  isWorkspaceScheduledForDeletion: (
    workspace:
      | { scheduledDeletionAt?: Date | string | null }
      | null
      | undefined,
  ) => Boolean(workspace?.scheduledDeletionAt),
  inboxService: {
    distinctConnectedChannels: vi.fn(async () => []),
  },
  platformCredentialService: {
    resolveForOwner: vi.fn(async () => null),
  },
  tenantService: {
    resolveVisibleChannels: vi.fn(async () => [
      "instagram",
      "messenger",
      "smtp",
      "telegram",
      "tiktok",
      "webchat",
      "whatsapp",
      "zalo",
    ]),
  },
  workspaceService: {
    find: vi.fn(async () => ({ ownerId: "owner-1" })),
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolvePlatformOwnerId: vi.fn(async () => "owner-1"),
  resolveOwnerForWorkspace: vi.fn(async () => "owner-1"),
}))

vi.mock("@/lib/workspace-quota", () => ({
  resolveWorkspaceBlockState: vi.fn(async () => ({
    blocked: false,
    blockReason: null,
  })),
}))

vi.mock("@/features/inboxes/components/inbox-card-list", () => ({
  InboxCardList: mockInboxCardList,
}))

vi.mock("@/features/inboxes/queries", () => ({
  listInboxes: vi.fn(async () => ({ data: [] })),
}))

vi.mock("@/features/inboxes/components/inbox-select-card", () => ({
  default: () => null,
}))

vi.mock(
  "@/features/integration-instagram/components/instagram-login-select",
  () => ({
    InstagramLoginSelect: () => null,
  }),
)

vi.mock("@/features/integration-instagram/libs/oauth", () => ({
  generateInstagramRedirectUri: vi.fn(async () => ""),
}))

vi.mock("@/features/integration-instagram/libs/oauth-facebook", () => ({
  generateInstagramFacebookRedirectUri: vi.fn(async () => ""),
}))

vi.mock("@/features/integration-messenger/libs/oauth", () => ({
  generateMessengerRedirectUri: vi.fn(async () => ""),
}))

vi.mock("@/features/integration-telegram/components/telegram-connect", () => ({
  TelegramConnect: () => null,
}))

vi.mock("@/features/integration-tiktok/libs/tiktok", () => ({
  generateTiktokRedirectUri: vi.fn(async () => ""),
}))

vi.mock("@/features/integration-webchat/simple-create-webchat", () => ({
  SimpleCreateWebchat: () => null,
}))

vi.mock("@/features/integration-whatsapp/components/whatsapp-create", () => ({
  default: () => null,
}))

vi.mock("@/features/integration-zalo/libs/zalo", () => ({
  generateZaloRedirectUri: vi.fn(async () => ""),
}))

vi.mock("@/features/flows/provider/flow-store-context", () => ({
  FlowStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock("@/features/custom-fields/provider/custom-field-store-context", () => ({
  CustomFieldStoreProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock(
  "@/features/integration-webchat/components/create-webchat-form",
  () => ({
    CreateWebchatForm: () => null,
  }),
)

vi.mock(
  "@/features/integration-webchat/components/update-webchat-form",
  () => ({
    UpdateWebchatForm: () => null,
  }),
)

vi.mock("@/features/integration-webchat/queries", () => ({
  findIntegrationWebchat: vi.fn(async () => ({})),
}))

vi.mock(
  "@/features/integration-instagram/components/update-instagram-form",
  () => ({
    UpdateInstagramForm: () => null,
  }),
)

vi.mock("@/features/integration-instagram/queries", () => ({
  findIntegrationInstagram: vi.fn(async () => ({})),
}))

vi.mock("@/components/app-breadcrumb", () => ({
  AppBreadcrumb: () => null,
}))

vi.mock(
  "@/features/integration-messenger/components/messenger-setting-tabs",
  () => ({
    MessengerSettingTabs: () => null,
  }),
)

vi.mock(
  "@/features/integration-whatsapp/components/whatsapp-setting-tabs",
  () => ({
    WhatsappSettingTabs: () => null,
  }),
)

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()

  return {
    ...actual,
    getIdFromParams: (
      params: Record<string, string | null | undefined>,
      key: string,
    ) => params[key] ?? null,
  }
})

vi.mock(
  "@/features/integration-whatsapp/profile/update-whatsapp-profile",
  () => ({
    UpdateWhatsappProfile: () => null,
  }),
)

const { default: CreateChannelPage } = await import(
  "../src/app/(no-sidebar)/channels/create/page"
)
const { default: DashboardPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/page"
)
const { default: MessengerLayout } = await import(
  "../src/app/space/[workspaceId]/messengers/[id]/layout"
)
const { default: UpdateInstagramPage } = await import(
  "../src/app/space/[workspaceId]/instagrams/[id]/edit/page"
)
const { default: WebchatEditPage } = await import(
  "../src/app/space/[workspaceId]/webchats/[id]/edit/page"
)
const { default: CreateWebchatPage } = await import(
  "../src/app/space/[workspaceId]/webchats/create/page"
)
const { default: WhatsappLayout } = await import(
  "../src/app/space/[workspaceId]/(integrations)/whatsapps/[id]/layout"
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

describe("channel route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCurrentUserId.mockResolvedValue("user-1")
  })

  test("guards workspace-scoped channel creation on /channels/create", async () => {
    await expect(
      CreateChannelPage({
        searchParams: Promise.resolve({
          channel: "whatsapp",
          workspaceId: "ws-1",
        }),
      }),
    ).resolves.toBeDefined()

    expect(mockRequireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "superAdmin",
    )
  })

  test("does not require workspace permission for the new-workspace flow", async () => {
    await expect(
      CreateChannelPage({
        searchParams: Promise.resolve({
          channel: "whatsapp",
          workspaceId: null,
        }),
      }),
    ).resolves.toBeDefined()

    expect(mockRequireWorkspacePermission).not.toHaveBeenCalled()
  })

  test("hides the dashboard add-channel card for non-superAdmins", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspace: { ownerId: "owner-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          analytics: true,
        },
      },
    })

    const dashboardTree = await DashboardPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })
    renderToStaticMarkup(dashboardTree)

    expect(mockInboxCardList).toHaveBeenCalledWith(
      expect.objectContaining({
        allowAddNew: false,
        workspaceId: "ws-1",
      }),
      undefined,
    )
  })

  test("shows the dashboard add-channel card for superAdmins", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspace: { ownerId: "owner-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          analytics: true,
          superAdmin: true,
        },
      },
    })

    const dashboardTree = await DashboardPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })
    renderToStaticMarkup(dashboardTree)

    expect(mockInboxCardList).toHaveBeenCalledWith(
      expect.objectContaining({
        allowAddNew: true,
        workspaceId: "ws-1",
      }),
      undefined,
    )
  })

  test("guards messenger, instagram, webchat and whatsapp edit surfaces for superAdmins", async () => {
    await expect(
      MessengerLayout({
        children: null,
        params: Promise.resolve({ workspaceId: "ws-1", id: "msg-1" }),
      }),
    ).resolves.toBeDefined()
    await expect(
      UpdateInstagramPage({
        params: Promise.resolve({ workspaceId: "ws-1", id: "ig-1" }),
      }),
    ).resolves.toBeDefined()
    await expect(
      WebchatEditPage({
        params: Promise.resolve({ workspaceId: "ws-1", id: "wc-1" }),
      }),
    ).resolves.toBeDefined()
    await expect(
      CreateWebchatPage({
        params: Promise.resolve({ workspaceId: "ws-1" }),
      }),
    ).resolves.toBeDefined()
    await expect(
      WhatsappLayout({
        children: null,
        params: Promise.resolve({ workspaceId: "ws-1", id: "wa-1" }),
      }),
    ).resolves.toBeDefined()

    expect(mockResolveGuardedWorkspaceId).toHaveBeenCalledWith(
      expect.any(Promise),
      "superAdmin",
    )
    expect(mockRequireWorkspacePermission).toHaveBeenCalledWith(
      "ws-1",
      "superAdmin",
    )
  })
})
