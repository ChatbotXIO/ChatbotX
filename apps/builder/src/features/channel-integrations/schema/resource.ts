import { channelIntegrationChannels } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const channelIntegrationResource = z.object({
  id: z.string().describe("Channel integration id."),
  channel: channelIntegrationChannels,
  inboxId: z.string().describe("Inbox this channel feeds. See `inboxes.list`."),
  name: z.string().describe("Display name (page, account or number name)."),
  externalId: z
    .string()
    .describe(
      "Vendor account id: WhatsApp phone number id, Messenger page id, Instagram id, Zalo OA id or TikTok open id.",
    ),
  wabaId: z.string().nullable().describe("WhatsApp Business Account id."),
  displayPhoneNumber: z.string().nullable().describe("WhatsApp phone number."),
  username: z.string().nullable().describe("Instagram username."),
  coexistEnabled: z.boolean().describe("Whether coexistence sync is enabled."),
  isCoexist: z
    .boolean()
    .nullable()
    .describe(
      "WhatsApp only: number is also used in the WhatsApp Business app.",
    ),
  hasCapiScope: z
    .boolean()
    .describe("Whether the Meta token can send Conversions API events."),
  datasetId: z.string().nullable().describe("Meta dataset id for CAPI."),
  capiTestEventCode: z
    .string()
    .nullable()
    .describe(
      "Events Manager test code; while set, CAPI events go to Test Events, not production.",
    ),
  capiDisconnected: z
    .boolean()
    .describe("Whether Conversions API was disconnected for this channel."),
  syncTagEnabledAt: z
    .date()
    .nullable()
    .describe("When tag sync was enabled; null when off or unsupported."),
  handoverResumeFlowId: z
    .string()
    .nullable()
    .describe(
      "WhatsApp/Messenger: flow that runs when a partner hands a conversation back. Change it with the handover-resume-flow route.",
    ),
  tokenRefreshError: z
    .string()
    .nullable()
    .describe("Set when the stored token needs the user to reconnect."),
  adsEligible: z
    .boolean()
    .describe("Whether this channel can be used for click-to-message ads."),
})

export const channelIntegrationIdRequest = z.object({
  id: zodBigintAsString().describe(
    "Channel integration id. Get it from the matching channel list route.",
  ),
})
