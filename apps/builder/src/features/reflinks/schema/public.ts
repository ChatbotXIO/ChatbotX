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

// Chat widget settings are dashboard-only for now.
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
