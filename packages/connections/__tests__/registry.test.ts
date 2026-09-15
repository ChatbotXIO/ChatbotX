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

  it("credential-strategy providers either implement fromCredentials or are pinned as a known live-connect gap (T4)", () => {
    // `resolve-provider.ts#resolveUnavailableReason` reports these as
    // `notImplemented` in `GET /v1/connection-providers` specifically
    // because they have no `fromCredentials`. Two distinct reasons:
    //   - `api`/`smtp`/`webchat`: self_serve with no external account to
    //     validate AND no stable per-instance identity to derive
    //     `Connection.sourceId` from before their satellite row exists (I1).
    //   - `chatbotx`: the internal built-in channel is auto-provisioned per
    //     workspace, never connected through a user-supplied credential.
    // A new credential-strategy provider added here without `fromCredentials`
    // silently becomes unreachable via `POST /v1/connections` — this pins
    // the exception list so that is a conscious choice, not a silent gap.
    const KNOWN_GAPS = new Set(["api", "chatbotx", "smtp", "webchat"])
    const CREDENTIAL_STRATEGIES = new Set(["token", "api_key", "self_serve"])
    const actualGaps: string[] = []
    for (const [type, adapter] of Object.entries(CONNECTION_REGISTRY)) {
      if (!(adapter && CREDENTIAL_STRATEGIES.has(adapter.provider.strategy))) {
        continue
      }
      if (!adapter.provider.fromCredentials) {
        actualGaps.push(type)
      }
    }
    expect(actualGaps.sort()).toEqual([...KNOWN_GAPS].sort())
  })

  it("telegram (multiAccount + fromCredentials) derives sourceId from the bot token, never a constant (I1)", () => {
    const adapter = CONNECTION_REGISTRY.telegram
    expect(adapter?.provider.multiAccount).toBe(true)
    expect(adapter?.provider.fromCredentials).toBeDefined()
    const first = adapter?.provider.describe({
      authType: "secretText",
      secretText: "111111:secret-a",
    } as never)
    const second = adapter?.provider.describe({
      authType: "secretText",
      secretText: "222222:secret-b",
    } as never)
    expect(first?.sourceId).not.toBe("workspace")
    expect(first?.sourceId).not.toBe(second?.sourceId)
  })
})
