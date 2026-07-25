import { z } from "zod"
import type { ChannelType } from "./channel"

export const broadcastScheduleTypes = z.enum(["now", "future"])
export type BroadcastScheduleType = z.infer<typeof broadcastScheduleTypes>

export const broadcastStatuses = z.enum([
  "scheduled",
  "sent",
  "sending",
  "cancelled",
])
export type BroadcastStatus = z.infer<typeof broadcastStatuses>

export const broadcastSubactions = z.enum([
  "allContacts",
  "messengerActiveContacts",
  "messengerTemplateMessage",
  "whatsappTemplateMessage",
  "whatsappWithin24Hours",
  "instagramActiveContacts",
  "telegramAllContacts",
  "tiktokActiveContacts",
])
export type BroadcastSubaction = z.infer<typeof broadcastSubactions>

type BroadcastAudienceRule = {
  requiresRecentInteractionWindow: boolean
}

export const broadcastSubactionAudienceRules: Record<
  BroadcastSubaction,
  BroadcastAudienceRule
> = {
  allContacts: { requiresRecentInteractionWindow: false },
  messengerActiveContacts: { requiresRecentInteractionWindow: true },
  messengerTemplateMessage: { requiresRecentInteractionWindow: false },
  whatsappTemplateMessage: { requiresRecentInteractionWindow: false },
  whatsappWithin24Hours: { requiresRecentInteractionWindow: true },
  instagramActiveContacts: { requiresRecentInteractionWindow: true },
  telegramAllContacts: { requiresRecentInteractionWindow: false },
  tiktokActiveContacts: { requiresRecentInteractionWindow: true },
}

export const requiresRecentInteractionWindow = (
  subaction: BroadcastSubaction | null | undefined,
): boolean =>
  subaction
    ? broadcastSubactionAudienceRules[subaction].requiresRecentInteractionWindow
    : false

export type BroadcastChannelCapability = {
  channel: ChannelType
  subactions: readonly BroadcastSubaction[]
  defaultSubaction: BroadcastSubaction
  // Only Messenger/WhatsApp expose a template-message broadcast; other channels
  // are flow-only. Keeping this on the registry is the single source of truth.
  supportsTemplateBroadcast: boolean
}

export const broadcastChannelCapabilities: readonly BroadcastChannelCapability[] =
  [
    {
      channel: "omnichannel",
      subactions: ["allContacts"],
      defaultSubaction: "allContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "messenger",
      subactions: ["messengerTemplateMessage", "messengerActiveContacts"],
      defaultSubaction: "messengerTemplateMessage",
      supportsTemplateBroadcast: true,
    },
    {
      channel: "whatsapp",
      subactions: ["whatsappTemplateMessage", "whatsappWithin24Hours"],
      defaultSubaction: "whatsappTemplateMessage",
      supportsTemplateBroadcast: true,
    },
    {
      channel: "zalo",
      subactions: ["allContacts"],
      defaultSubaction: "allContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "instagram",
      subactions: ["instagramActiveContacts"],
      defaultSubaction: "instagramActiveContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "telegram",
      subactions: ["telegramAllContacts"],
      defaultSubaction: "telegramAllContacts",
      supportsTemplateBroadcast: false,
    },
    {
      channel: "tiktok",
      subactions: ["tiktokActiveContacts"],
      defaultSubaction: "tiktokActiveContacts",
      supportsTemplateBroadcast: false,
    },
  ]

export const findBroadcastChannelCapability = (
  channel: ChannelType,
): BroadcastChannelCapability | undefined =>
  broadcastChannelCapabilities.find(
    (capability) => capability.channel === channel,
  )

export const broadcastFlowTypes = z.enum(["flow", "template"])
export type BroadcastFlowType = z.infer<typeof broadcastFlowTypes>
