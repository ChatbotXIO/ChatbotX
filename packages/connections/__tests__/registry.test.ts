import { integrationTypes } from "@chatbotx.io/database/partials"
import { CHANNEL_CAPABILITIES, channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, it } from "vitest"
import { CONNECTION_REGISTRY } from "../src/registry"

const channelToIntegrationTable = (channel: string): string => {
  const integrationName = channel
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
  return `Integration${integrationName}`
}

describe("CONNECTION_REGISTRY", () => {
  it("has an entry (possibly null) for every IntegrationType", () => {
    for (const type of integrationTypes.options) {
      expect(Object.hasOwn(CONNECTION_REGISTRY, type)).toBe(true)
    }
  })

  it("every non-null adapter's provider is populated, and store is populated except chatbotx's documented no-satellite-table exception", () => {
    for (const [type, adapter] of Object.entries(CONNECTION_REGISTRY)) {
      if (!adapter) {
        continue
      }
      expect(adapter.provider, `${type}.provider`).toBeDefined()
      if (type === "chatbotx") {
        // Internal built-in channel: no `Integration<Chatbotx>` satellite
        // table exists — the `Inbox` row itself is the whole connection.
        expect(adapter.store, `${type}.store`).toBeUndefined()
        continue
      }
      expect(adapter.store, `${type}.store`).toBeDefined()
    }
  })

  it("kind=channel adapters map onto a real ChannelType (directly, via instagramFacebook -> instagram, or chatbotx's documented exception)", () => {
    const channelSet = new Set<string>(channelTypes.options)
    for (const [type, adapter] of Object.entries(CONNECTION_REGISTRY)) {
      if (adapter?.provider.kind !== "channel" || type === "chatbotx") {
        // `chatbotx` is a channel-shaped internal integration (it has
        // `channels` handlers) with no formal `ChannelType` membership and
        // no `Inbox.channel = "chatbotx"` value — it is never offered
        // through the normal channel-connect surface.
        continue
      }
      const impliedChannel = type === "instagramFacebook" ? "instagram" : type
      expect(
        channelSet.has(impliedChannel),
        `${type} -> ${impliedChannel}`,
      ).toBe(true)
    }
  })

  it("channel-kind adapters keyed directly by ChannelType use the matching Integration<Channel> table", () => {
    for (const [type, adapter] of Object.entries(CONNECTION_REGISTRY)) {
      if (adapter?.provider.kind !== "channel") {
        continue
      }
      if (!(channelTypes.options as readonly string[]).includes(type)) {
        continue
      }
      expect(adapter.store.table).toBe(channelToIntegrationTable(type))
    }
  })

  it("credentialType is set iff the underlying channel requires a platform credential", () => {
    for (const channel of channelTypes.options) {
      const adapter =
        CONNECTION_REGISTRY[channel as keyof typeof CONNECTION_REGISTRY]
      if (!adapter) {
        continue
      }
      const requiresCredential =
        CHANNEL_CAPABILITIES[channel].requiresCredential
      expect(Boolean(adapter.credentialType), channel).toBe(requiresCredential)
    }
  })
})
