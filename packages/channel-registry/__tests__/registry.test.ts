import {
  postTrackingChannels,
  profileSnapshotChannels,
} from "@chatbotx.io/database/partials"
import {
  POST_CHANNEL_CAPABILITIES,
  POST_MANAGEMENT_CHANNELS,
} from "@chatbotx.io/utils/channel"
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
  allIntegrations,
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

describe("profile snapshot capability", () => {
  test.each(
    profileSnapshotChannels,
  )("%s implements getProfileSnapshot (capability list and handler cannot drift)", (channel) => {
    expect(
      integrations[channel].hasChannelHandler("contact", "getProfileSnapshot"),
    ).toBe(true)
  })

  test("Instagram-via-Facebook (the variant resolved for the instagram channel) implements it too", () => {
    expect(
      integrations.instagramFacebook.hasChannelHandler(
        "contact",
        "getProfileSnapshot",
      ),
    ).toBe(true)
  })
})

describe("post tracking capability", () => {
  test.each(
    postTrackingChannels,
  )("%s implements getPostDetails (capability list and handler cannot drift)", (channel) => {
    // The registered integrations are distinct generic types; only the shared
    // handler-lookup method matters here.
    const integration = integrations[channel] as unknown as {
      hasChannelHandler: (group: string, name: string) => boolean
    }
    expect(integration.hasChannelHandler("contact", "getPostDetails")).toBe(
      true,
    )
  })

  test("Instagram-via-Facebook (the variant resolved for the instagram channel) implements it too", () => {
    expect(
      integrations.instagramFacebook.hasChannelHandler(
        "contact",
        "getPostDetails",
      ),
    ).toBe(true)
  })
})

describe("post listing capability", () => {
  type HandlerLookup = {
    hasChannelHandler: (group: string, name: string) => boolean
  }
  // The integrations behind each channel: Instagram has two logins and the
  // channel resolves to one of them per connection.
  const integrationsByChannel = {
    instagram: [integrations.instagram, integrations.instagramFacebook],
    messenger: [integrations.messenger],
    threads: [integrations.threads],
    tiktok: [integrations.tiktok],
  } as const

  test.each(
    POST_MANAGEMENT_CHANNELS,
  )("every integration behind %s lists and reads its posts", (channel) => {
    for (const integration of integrationsByChannel[channel]) {
      const lookup = integration as unknown as HandlerLookup
      expect(lookup.hasChannelHandler("post", "listPosts")).toBe(true)
      expect(lookup.hasChannelHandler("post", "getPost")).toBe(true)
    }
  })

  test("a channel outside the listing has no post handlers", () => {
    const lookup = integrations.whatsapp as unknown as HandlerLookup

    expect(lookup.hasChannelHandler("post", "listPosts")).toBe(false)
  })

  test("the capability table covers exactly the listed channels", () => {
    expect(Object.keys(POST_CHANNEL_CAPABILITIES).sort()).toEqual(
      [...POST_MANAGEMENT_CHANNELS].sort(),
    )
  })

  test("only Facebook reports an individual author", () => {
    const withAuthor = POST_MANAGEMENT_CHANNELS.filter(
      (channel) => POST_CHANNEL_CAPABILITIES[channel].author,
    )

    expect(withAuthor).toEqual(["messenger"])
  })

  test("comment settings are offered exactly where comments are tracked per post", () => {
    for (const channel of POST_MANAGEMENT_CHANNELS) {
      expect(POST_CHANNEL_CAPABILITIES[channel].commentSettings).toBe(
        (postTrackingChannels as readonly string[]).includes(channel),
      )
    }
  })

  test("liking and deleting a comment are offered exactly where the channel has the call", () => {
    // Instagram's like is a no-op in its handler and Threads has only hide:
    // the comments window must grey those controls out, not silently do nothing.
    expect(
      Object.fromEntries(
        POST_MANAGEMENT_CHANNELS.map((channel) => [
          channel,
          {
            delete: POST_CHANNEL_CAPABILITIES[channel].commentDelete,
            like: POST_CHANNEL_CAPABILITIES[channel].commentLike,
          },
        ]),
      ),
    ).toEqual({
      instagram: { delete: true, like: false },
      messenger: { delete: true, like: true },
      threads: { delete: false, like: false },
      tiktok: { delete: true, like: true },
    })
  })

  test("a comment count comes from the webhook only where the platform reports none", () => {
    expect(
      Object.fromEntries(
        POST_MANAGEMENT_CHANNELS.map((channel) => [
          channel,
          POST_CHANNEL_CAPABILITIES[channel].commentCountSource,
        ]),
      ),
    ).toEqual({
      instagram: "platform",
      messenger: "platform",
      threads: "webhook",
      tiktok: "platform",
    })
  })

  test("a webhook-counted channel reports no comment count in its listing", () => {
    for (const channel of POST_MANAGEMENT_CHANNELS) {
      if (POST_CHANNEL_CAPABILITIES[channel].commentCountSource === "webhook") {
        expect(POST_CHANNEL_CAPABILITIES[channel].counts).toBe(false)
      }
    }
  })

  test("a channel is batch-readable exactly where its post handler has getPostsMetrics", () => {
    const lookups: Record<string, HandlerLookup> = {
      instagram: integrations.instagram as unknown as HandlerLookup,
      messenger: integrations.messenger as unknown as HandlerLookup,
      threads: integrations.threads as unknown as HandlerLookup,
      tiktok: integrations.tiktok as unknown as HandlerLookup,
    }
    for (const channel of POST_MANAGEMENT_CHANNELS) {
      expect(
        lookups[channel].hasChannelHandler("post", "getPostsMetrics"),
      ).toBe(POST_CHANNEL_CAPABILITIES[channel].metricsBatchRead)
    }
  })

  test("every channel tracked per post is listed", () => {
    for (const channel of postTrackingChannels) {
      expect(POST_MANAGEMENT_CHANNELS).toContain(channel)
    }
  })
})

describe("workspace teardown registry", () => {
  // purge/teardown hand `allIntegrations` to the lifecycle service and the
  // worker resolves provider integrations through it, so googleAds must be there.
  test("allIntegrations includes googleAds", () => {
    expect(allIntegrations.googleAds).toBe(integrations.googleAds)
    expect(allIntegrations.googleAds).toBeDefined()
  })
})
