// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The channels settings list grandfathers a channel back into view when
// it's hidden by policy but the workspace already has a connected inbox for
// it (see settings-channels-visibility.test.ts). Inside that grandfathered
// row, the manage component's own "Add <Channel>" button must be disabled —
// otherwise it dead-ends at /channels/create, which silently falls through
// to the picker instead of creating anything.
//
// Each settings/channels/<channel>/page.tsx computes this for itself via
// resolveChannelCreatable. The pages additionally 404 when the channel is
// not visible at all (hidden by policy AND not grandfathered) — so the
// hidden-channel cases below mark the channel as connected, matching the
// real grandfather scenario they describe.
// ---------------------------------------------------------------------------

const {
  mockDistinctConnectedChannels,
  mockResolveVisibleChannels,
  mockWorkspaceServiceFind,
} = vi.hoisted(() => ({
  mockDistinctConnectedChannels: vi.fn(async (): Promise<string[]> => []),
  mockResolveVisibleChannels: vi.fn(),
  mockWorkspaceServiceFind: vi.fn(async () => ({
    id: "ws-1",
    ownerId: "owner-1",
  })),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    distinctConnectedChannels: mockDistinctConnectedChannels,
  },
  tenantService: {
    resolveVisibleChannels: mockResolveVisibleChannels,
  },
  workspaceService: {
    find: mockWorkspaceServiceFind,
  },
  platformCredentialService: {
    resolveForOwner: vi.fn(async () => null),
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(
    async (workspace: { ownerId: string }) => workspace.ownerId,
  ),
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
}))

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

const { mockZaloManage } = vi.hoisted(() => ({
  mockZaloManage: vi.fn(() => null),
}))
vi.mock("@/features/integration-zalo/zalo-manage", () => ({
  ZaloManage: mockZaloManage,
}))
vi.mock("@/features/integration-zalo/queries", () => ({
  listIntegrationZalo: vi.fn(async () => ({ data: [] })),
}))

const { mockSmtpManage } = vi.hoisted(() => ({
  mockSmtpManage: vi.fn(() => null),
}))
vi.mock("@/features/integration-smtp/smtp-manage", () => ({
  SmtpManage: mockSmtpManage,
}))
vi.mock("@/features/integration-smtp/queries", () => ({
  listIntegrationSmtps: vi.fn(async () => ({ data: [] })),
}))

const { mockTelegramManage } = vi.hoisted(() => ({
  mockTelegramManage: vi.fn(() => null),
}))
vi.mock("@/features/integration-telegram/telegram-manage", () => ({
  TelegramManage: mockTelegramManage,
}))
vi.mock("@/features/integration-telegram/queries", () => ({
  listIntegrationTelegrams: vi.fn(async () => ({ data: [] })),
}))

const { mockWebchatTable } = vi.hoisted(() => ({
  mockWebchatTable: vi.fn(() => null),
}))
vi.mock("@/features/integration-webchat/webchat-table", () => ({
  WebchatTable: mockWebchatTable,
}))
vi.mock("@/features/integration-webchat/queries", () => ({
  listIntegrationWebchats: vi.fn(async () => ({ data: [], pageCount: 0 })),
}))

const { default: SettingChannelZaloPage } = await import(
  "../src/app/space/[workspaceId]/(settings)/settings/channels/zalo/page"
)
const { default: SettingChannelSmtpPage } = await import(
  "../src/app/space/[workspaceId]/(settings)/settings/channels/smtp/page"
)
const { default: SettingChannelTelegramPage } = await import(
  "../src/app/space/[workspaceId]/(settings)/settings/channels/telegram/page"
)
const { resolveChannelCreatable } = await import(
  "../src/lib/workspace/resolve-channel-creatable"
)

describe("channels settings Add-button gating", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceServiceFind.mockResolvedValue({
      id: "ws-1",
      ownerId: "owner-1",
    })
    mockDistinctConnectedChannels.mockResolvedValue([])
  })

  test("the reported bug: a grandfathered channel (hidden by policy) gets canCreate=false", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["whatsapp"])
    mockDistinctConnectedChannels.mockResolvedValue(["zalo"])

    const result = await SettingChannelZaloPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    expect((result as { props: { canCreate: boolean } }).props.canCreate).toBe(
      false,
    )
  })

  test("a visible channel gets canCreate=true", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["zalo", "whatsapp"])

    const result = await SettingChannelZaloPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    expect((result as { props: { canCreate: boolean } }).props.canCreate).toBe(
      true,
    )
  })

  test("smtp is exempt from policy: SmtpManage receives no canCreate prop even when everything is hidden", async () => {
    mockResolveVisibleChannels.mockResolvedValue([])

    const result = await SettingChannelSmtpPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    expect(result as { props: object }).not.toHaveProperty("props.canCreate")
  })

  test("resolveChannelCreatable exempts smtp from policy even when nothing is visible", async () => {
    mockResolveVisibleChannels.mockResolvedValue([])

    await expect(resolveChannelCreatable("ws-1", "smtp")).resolves.toBe(true)
  })

  test("telegram — historically the bypass-prone channel — gets canCreate=false when hidden", async () => {
    mockResolveVisibleChannels.mockResolvedValue([])
    mockDistinctConnectedChannels.mockResolvedValue(["telegram"])

    const result = await SettingChannelTelegramPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    expect((result as { props: { canCreate: boolean } }).props.canCreate).toBe(
      false,
    )
  })

  test("webchat — the other bypass-prone channel — gets canCreate=false when hidden", async () => {
    const { default: SettingChannelWebchatPage } = await import(
      "../src/app/space/[workspaceId]/(settings)/settings/channels/webchat/page"
    )
    mockResolveVisibleChannels.mockResolvedValue([])
    mockDistinctConnectedChannels.mockResolvedValue(["webchat"])

    const result = await SettingChannelWebchatPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
      searchParams: Promise.resolve({}),
    })

    // webchat/page.tsx wraps WebchatTable in <Suspense>, so canCreate lives
    // one level down on the Suspense child's props.
    const suspenseElement = result as {
      props: { children: { props: { canCreate: boolean } } }
    }
    expect(suspenseElement.props.children.props.canCreate).toBe(false)
  })
})
