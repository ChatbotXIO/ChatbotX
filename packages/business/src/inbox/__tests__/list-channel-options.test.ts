import { beforeEach, describe, expect, test, vi } from "vitest"

// `inboxService.listChannelOptionsByWorkspace` is a
// thin pass-through to `inboxRepository.listOptionsByWorkspaceAndChannel`
// (bounded id/name projection, scoped by workspace AND channel at the query
// level). Replaces the Calls page's use of
// `inboxService.listWithIntegrationsByWorkspace` + in-memory `.filter()`,
// which eager-loads all nine credential-bearing integration relations just
// to discard every non-whatsapp row.
const mocks = vi.hoisted(() => ({
  listOptionsByWorkspaceAndChannel: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  inboxRepository: {
    listOptionsByWorkspaceAndChannel: mocks.listOptionsByWorkspaceAndChannel,
  },
}))

const { inboxService } = await import("../service")

describe("inboxService.listChannelOptionsByWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listOptionsByWorkspaceAndChannel.mockResolvedValue([
      { id: "inbox-1", name: "Support" },
    ])
  })

  test("delegates to inboxRepository.listOptionsByWorkspaceAndChannel with workspaceId and channel", async () => {
    const result = await inboxService.listChannelOptionsByWorkspace({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })

    expect(mocks.listOptionsByWorkspaceAndChannel).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
    })
    expect(result).toEqual([{ id: "inbox-1", name: "Support" }])
  })
})
