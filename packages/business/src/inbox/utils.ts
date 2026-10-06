import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { encodeRef, type RefConfig } from "../referral"

type LinkConfig = {
  url: string
  refKey: string
  refValue?: string
}

/**
 * Channels whose inbound webhook actually extracts a `ref` and hands it to
 * `runRef`. Every other channel can still have a *link* built (it opens the
 * chat), but the ref is dropped on arrival — so any surface whose whole
 * purpose is delivering a ref must gate on this.
 *
 * messenger  integrations/messenger/src/handlers/message/incoming-message.ts
 * instagram  integrations/instagram/src/handlers/message/incoming-message.ts
 *            integrations/instagram-facebook/src/handlers/message/incoming-message.ts
 * telegram   integrations/telegram/src/handlers/message/incoming-message.ts (`/start <param>`)
 * whatsapp   integrations/whatsapp/src/handlers/message/incomming-message.ts (`/ref-` prefix)
 * webchat    apps/builder/src/app/(no-sidebar)/webchat/page.tsx
 *
 * NOT capable — both hardcode `ref: null` on the way in:
 * zalo       integrations/zalo/src/handlers/message/incoming-message/index.ts
 * tiktok     integrations/tiktok/src/handlers/message/incoming-message.ts
 * (`tiktok.me` below is not a real host either.)
 * Implementing extraction at either site means adding the channel here and
 * nothing else.
 */
export const REF_CAPABLE_CHANNELS = [
  "messenger",
  "instagram",
  "whatsapp",
  "telegram",
  "webchat",
] as const satisfies readonly ChannelType[]

export function canReceiveRef(channel: ChannelType): boolean {
  return (REF_CAPABLE_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Channels a *minigame share link* may be minted for: ref-capable minus
 * `webchat`. Referral credit is guarded only by "the invitee is a different
 * `Contact`", which every other channel backs with a real account identity.
 * A webchat visitor in a private window is a brand-new `Contact` every time,
 * so a webchat share link is self-farmable up to `maxSharesPerPerson` by the
 * sharer alone. Reflinks and QR codes keep using `canReceiveRef` — they hand
 * out no per-invitee reward, so the same identity gap does not pay.
 */
export const MINIGAME_SHARE_CHANNELS = REF_CAPABLE_CHANNELS.filter(
  (channel) => channel !== "webchat",
)

export function canShareMinigame(channel: ChannelType): boolean {
  return (MINIGAME_SHARE_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Channels every "open chat" link list leaves out (Get Link dialog, ref link
 * API and chat widget): SMTP has no chat link and `tiktok.me` is not a real
 * host.
 */
export const NON_LINKABLE_CHANNELS = [
  "smtp",
  "tiktok",
] as const satisfies readonly ChannelType[]

export function isLinkableChannel(channel: ChannelType): boolean {
  return !(NON_LINKABLE_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Channels with no "open chat" deep link that the ref link chat widget still
 * lists by linking to the account's public profile instead. Neither channel
 * passes a ref through, so the profile link never carries one — and it stays
 * out of `buildInboxLink`, whose callers (flow Get Link, email buttons) need
 * a link that actually starts a flow.
 */
export const PROFILE_LINK_CHANNELS = [
  "threads",
  "tiktok",
] as const satisfies readonly ChannelType[]

export function isProfileLinkChannel(channel: ChannelType): boolean {
  return (PROFILE_LINK_CHANNELS as readonly string[]).includes(channel)
}

/**
 * Public profile URL of a Threads or TikTok inbox, e.g.
 * `https://www.threads.com/@shop`. TikTok's handle is the inbox `sourceId`
 * (stamped at connect) rather than `integrationTiktok.auth`, which also holds
 * the OAuth tokens. Undefined for other channels or a missing handle.
 */
export function buildInboxProfileLink(
  inbox: InboxWithIntegrations,
): string | undefined {
  if (inbox.channel === "threads") {
    return toProfileUrl("www.threads.com", inbox.integrationThreads?.username)
  }
  if (inbox.channel === "tiktok") {
    return toProfileUrl("www.tiktok.com", inbox.sourceId)
  }
}

function toProfileUrl(host: string, handle: string | null | undefined) {
  return handle ? `https://${host}/@${encodeURIComponent(handle)}` : undefined
}

export function buildInboxLink(
  appUrl: string,
  inbox: InboxWithIntegrations,
  refConfig?: RefConfig,
): string | undefined {
  const refValue = refConfig ? encodeRef(refConfig) : undefined
  const allLinkConfigs: Record<ChannelType, LinkConfig | undefined> = {
    messenger: {
      url: `https://m.me/${inbox.sourceId}`,
      refKey: "ref",
      refValue,
    },
    instagram: {
      url: `https://ig.me/m/${inbox.integrationInstagram?.username}`,
      refKey: "ref",
      refValue,
    },
    threads: undefined,
    whatsapp: {
      url: `https://wa.me/${inbox.integrationWhatsapp?.displayPhoneNumber ?? ""}`,
      refKey: "text",
      refValue: refValue ? `/ref-${refValue}` : undefined,
    },
    telegram: {
      url: `https://t.me/${inbox.name}`,
      refKey: "start",
      refValue,
    },
    zalo: {
      url: `https://zalo.me/${inbox.sourceId}`,
      refKey: "ref",
      refValue,
    },
    webchat: {
      url: `${appUrl}/webchat?workspaceId=${inbox.workspaceId}&webchatId=${inbox.sourceId}`,
      refKey: "ref",
      refValue,
    },
    tiktok: {
      url: `https://tiktok.me/${inbox.sourceId}`,
      refKey: "ref",
      refValue,
    },
    smtp: undefined,
    api: undefined,
    omnichannel: undefined,
  }
  const config = allLinkConfigs[inbox.channel as ChannelType]

  if (!config) {
    return
  }

  const url = new URL(config.url)
  if (config.refValue) {
    url.searchParams.set(config.refKey, config.refValue)
  }
  return url.toString()
}

export function getInboxLinks(
  appUrl: string,
  inboxes: InboxWithIntegrations[],
  refConfig?: RefConfig,
): { inbox: InboxWithIntegrations; url: string }[] {
  return inboxes
    .map((inbox) => {
      const url = buildInboxLink(appUrl, inbox, refConfig)
      if (!url) {
        return null
      }
      return { inbox, url }
    })
    .filter(
      (item): item is { inbox: InboxWithIntegrations; url: string } =>
        item !== null,
    )
}

export function buildPostLink(channel: ChannelType, postId: string): string {
  const allLinkConfigs: Record<ChannelType, string> = {
    messenger: `https://fb.com/${postId}`,
    instagram: "",
    threads: "",
    whatsapp: "",
    telegram: "",
    zalo: "",
    tiktok: "",
    webchat: "",
    smtp: "",
    api: "",
    omnichannel: "",
  }

  return allLinkConfigs[channel]
}

export function buildMessageLink(
  channel: ChannelType,
  messageId: string,
): string {
  const allLinkConfigs: Record<ChannelType, string> = {
    messenger: `https://fb.com/${messageId}`,
    instagram: `https://instagram.com/p/${messageId}`,
    threads: "",
    whatsapp: "",
    telegram: "",
    zalo: "",
    tiktok: "",
    webchat: "",
    smtp: "",
    api: "",
    omnichannel: "",
  }

  return allLinkConfigs[channel]
}
