import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { encodeRef, type RefConfig } from "../referral"

type LinkConfig = {
  url: string
  refKey: string
  refValue?: string
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
    whatsapp: "",
    telegram: "",
    zalo: "",
    tiktok: "",
    webchat: "",
    smtp: "",
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
    whatsapp: "",
    telegram: "",
    zalo: "",
    tiktok: "",
    webchat: "",
    smtp: "",
    omnichannel: "",
  }

  return allLinkConfigs[channel]
}
