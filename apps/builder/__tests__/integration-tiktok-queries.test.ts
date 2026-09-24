// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const listByWorkspaceMock = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  tiktokIntegrationService: { listByWorkspace: listByWorkspaceMock },
}))

vi.mock("@chatbotx.io/integration-tiktok", () => ({
  tiktokNeedsReauthorization: vi.fn(() => false),
}))

const { listIntegrationTiktoks } = await import(
  "@/features/integration-tiktok/queries"
)

describe("listIntegrationTiktoks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("includes inboxId in the client-safe resource", async () => {
    listByWorkspaceMock.mockResolvedValue([
      {
        id: "integration-1",
        inboxId: "inbox-1",
        name: "TikTok account",
        openId: "open-1",
        tokenRefreshError: null,
        auth: { metadata: {} },
      },
    ])

    const result = await listIntegrationTiktoks({
      where: { workspaceId: "workspace-1" },
    })

    expect(result.data[0]).toMatchObject({
      id: "integration-1",
      inboxId: "inbox-1",
    })
  })
})
