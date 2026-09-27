import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  buildContext: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  inboxService: { find: vi.fn() },
  integrationThreadsService: {
    findByInboxId: vi.fn(),
    findByThreadsUserId: vi.fn(),
  },
  workspaceService: { findById: vi.fn() },
}))

const {
  integrations,
  integrationService,
  resolveIntegrationContextFromContactInbox,
} = await import("../src/registry")

describe("resolveIntegrationContextFromContactInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildContext.mockResolvedValue({ storagePrefix: "workspace-1" })
  })

  test("selects the Instagram integration matching the stored integration type", async () => {
    const contactInbox = {
      id: "contact-inbox-1",
      channel: "instagram",
      inboxId: "inbox-1",
    } as never
    const facebookRow = {
      id: "integration-facebook",
      inboxId: "inbox-1",
      type: "facebook",
      auth: { authType: "none" as const },
    }
    const nativeRow = {
      id: "integration-native",
      inboxId: "inbox-1",
      type: "instagram",
      auth: { authType: "none" as const },
    }
    const lookup = vi
      .spyOn(integrationService, "getIntegrationFromContactInbox")
      .mockResolvedValueOnce(facebookRow)
      .mockResolvedValueOnce(nativeRow)

    const facebookResult = await resolveIntegrationContextFromContactInbox({
      workspaceId: "workspace-1",
      contactInbox,
    })
    const nativeResult = await resolveIntegrationContextFromContactInbox({
      workspaceId: "workspace-1",
      contactInbox,
    })

    expect(facebookResult.integration).toBe(integrations.instagramFacebook)
    expect(nativeResult.integration).toBe(integrations.instagram)
    expect(lookup).toHaveBeenCalledTimes(2)
    expect(mocks.buildContext).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-1",
      integrationType: "instagram",
      integration: facebookRow,
    })
    expect(mocks.buildContext).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-1",
      integrationType: "instagram",
      integration: nativeRow,
    })
  })
})
