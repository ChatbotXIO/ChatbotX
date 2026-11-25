// @vitest-environment node

import { enabledContentTypes } from "@chatbotx.io/utils/post-publishing"
import { socialProviders } from "@chatbotx.io/utils/social-account"
import { describe, expect, test, vi } from "vitest"

const { service } = vi.hoisted(() => ({
  service: { get: vi.fn(), list: vi.fn() },
}))

vi.mock("@chatbotx.io/business", () => ({ publishDestinationService: service }))

const { publishDestinationOperations } = await import(
  "@/features/publish-destinations/lib/operations"
)

const destination = (provider: string) => ({
  avatar: null,
  externalId: "x",
  id: `d-${provider}`,
  inboxId: null,
  integrationId: null,
  missingScopes: [],
  name: "n",
  pausedUntil: null,
  pauseReason: null,
  profileUrl: null,
  provider,
  socialAccountId: null,
  state: "ready",
  viaFacebook: false,
})

describe("publish destination content types", () => {
  test("a TikTok destination offers video only", async () => {
    service.list.mockImplementation(({ providers }: { providers: string[] }) =>
      Promise.resolve({
        destinations: [destination(providers[0] ?? "")],
        truncated: false,
      }),
    )

    const { items } = await publishDestinationOperations.list({
      providers: ["tiktok"],
      workspaceId: "ws",
    })

    expect(items[0]?.destinations[0]?.contentTypes).toEqual(["video"])
  })

  test("every network lists what its publishing rules enable", async () => {
    for (const provider of socialProviders.options) {
      service.get.mockResolvedValue(destination(provider))
      const resource = await publishDestinationOperations.get({
        id: "d",
        workspaceId: "ws",
      })
      expect(resource.contentTypes).toEqual(enabledContentTypes(provider))
    }
  })
})
