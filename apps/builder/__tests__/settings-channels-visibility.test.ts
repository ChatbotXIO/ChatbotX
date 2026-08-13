// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The settings channels accordion must:
//   1. grandfather already-connected channels back in even when hidden by
//      admin policy, and
//   2. never hide a "manageable but not creatable" channel (currently only
//      smtp) — that class of channel sits outside channel-visibility policy
//      entirely, so it must always render regardless of any hidden list.
// A regression here previously made smtp permanently disappear for any
// workspace with no existing smtp inbox, since resolveVisibleChannels only
// ever narrows CREATABLE_CHANNELS (which never includes smtp).
// ---------------------------------------------------------------------------

const { mockResolveVisibleChannels, mockDistinctConnectedChannels } =
  vi.hoisted(() => ({
    mockResolveVisibleChannels: vi.fn(),
    mockDistinctConnectedChannels: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    distinctConnectedChannels: mockDistinctConnectedChannels,
  },
  tenantService: {
    resolveVisibleChannels: mockResolveVisibleChannels,
  },
  workspaceService: {
    find: vi.fn(async () => ({ id: "ws-1", ownerId: "owner-1" })),
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(async () => "owner-1"),
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not found")
  }),
  useParams: () => ({ workspaceId: "ws-1" }),
  useSelectedLayoutSegment: () => null,
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

vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: ({ channel }: { channel: string }) => channel,
}))

const { default: SettingsChannelsLayout } = await import(
  "../src/app/space/[workspaceId]/(settings)/settings/channels/layout"
)

describe("settings channels layout visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("smtp always renders even when it has no connected inbox and creatable-channel policy is empty", async () => {
    mockResolveVisibleChannels.mockResolvedValue([])
    mockDistinctConnectedChannels.mockResolvedValue([])

    const tree = await SettingsChannelsLayout({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    // AccordionContent is collapsed by default, so slot content never
    // appears in static markup — assert on the trigger label (rendered via
    // the mocked InboxIcon) to confirm the accordion *item* exists at all.
    expect(renderToStaticMarkup(tree)).toContain(">smtp<")
  })

  test("grandfathers an already-connected channel hidden by policy back into the accordion", async () => {
    mockResolveVisibleChannels.mockResolvedValue(["whatsapp"])
    mockDistinctConnectedChannels.mockResolvedValue(["zalo"])

    const tree = await SettingsChannelsLayout({
      params: Promise.resolve({ workspaceId: "ws-1" }),
    })

    const html = renderToStaticMarkup(tree)
    expect(html).toContain(">whatsapp<")
    expect(html).toContain(">zalo<")
    expect(html).not.toContain(">tiktok<")
  })
})
