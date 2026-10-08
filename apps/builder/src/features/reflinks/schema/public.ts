import { channelTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { reflinkResource } from "./resource"

export const reflinkChannelLinkResource = z.object({
  inboxId: z.string().describe("Connected channel (inbox) the link opens."),
  inboxName: z.string().describe("Channel name, e.g. the Facebook Page name."),
  channel: channelTypes.describe("Channel type of the inbox."),
  url: z
    .string()
    .describe(
      "Full link that opens a chat on this channel and runs the ref link, e.g. `https://m.me/<pageId>?ref=<name>`. Threads and TikTok have no chat link, so theirs is the account's public profile, e.g. `https://www.threads.com/@<username>`.",
    ),
  receivesRef: z
    .boolean()
    .describe(
      "Whether this channel passes the ref through. When false (e.g. Zalo, Threads, TikTok) the link opens the chat or profile but the ref link's flow does not run.",
    ),
})

// Chat widget settings have their own endpoints; see
// `reflinkChatWidgetPublicResource`.
export const reflinkPublicResource = reflinkResource
  .omit({
    widgetAuthorizedDomains: true,
    widgetHiddenInboxIds: true,
    widgetLogoFileId: true,
    widgetBrandName: true,
    widgetBrandUrl: true,
    widgetLogoBackgroundColor: true,
  })
  .extend({
    links: z
      .array(reflinkChannelLinkResource)
      .describe(
        "One open-chat link per connected channel (the chat widget's channel list). Empty when no linkable channel is connected.",
      ),
  })

export const reflinkChatWidgetPublicResource = z.object({
  reflinkId: z.string().describe("Ref link the chat widget belongs to."),
  authorizedDomains: z
    .array(z.string())
    .describe("Domains allowed to embed the chat widget. Empty = any domain."),
  hiddenInboxIds: z
    .array(z.string())
    .describe("Inboxes (channels) left out of the chat widget."),
  logoFileId: z
    .string()
    .nullable()
    .describe(
      "Media library file shown on the widget's toggle button, or null for the default chat icon.",
    ),
  logoUrl: z
    .string()
    .nullable()
    .describe("Public URL of the logo image, or null when none is set."),
  logoBackgroundColor: z
    .string()
    .describe("Background of the default chat icon, as a hex code."),
  brandName: z
    .string()
    .nullable()
    .describe(
      "Brand name in the widget's powered-by line, or null when the line is hidden.",
    ),
  brandUrl: z
    .string()
    .nullable()
    .describe("Where the powered-by brand name links to, or null."),
  scriptUrl: z
    .string()
    .describe(
      "URL of the chat widget script on the app domain, e.g. `https://<app-domain>/chat-widget/ref-widget.js`.",
    ),
  embedCode: z
    .string()
    .describe(
      "Ready-to-paste `<script>` tag for the site's HTML, placed before `</body>`. Saved settings apply without pasting it again.",
    ),
  channels: z
    .array(reflinkChannelLinkResource)
    .describe(
      "Channels the widget shows: the ref link's open-chat links minus `hiddenInboxIds`.",
    ),
})
