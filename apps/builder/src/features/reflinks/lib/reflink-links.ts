import { inboxService, resolveTenantSettings } from "@chatbotx.io/business"
import { canReceiveRef, getInboxLinks } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"

/**
 * Channels the dashboard's "Get Link" dialog leaves out
 * (`features/inboxes/components/get-inbox-url.tsx`): SMTP has no chat link
 * and `tiktok.me` is not a real host.
 */
const SKIPPED_CHANNELS: ChannelType[] = ["smtp", "tiktok"]

export type ReflinkChannelLink = {
  inboxId: string
  inboxName: string
  channel: ChannelType
  url: string
  receivesRef: boolean
}

/**
 * The per-channel "open chat" links the dashboard's Copy URL dialog shows
 * for a ref link, e.g. `https://m.me/<pageId>?ref=<name>`. Loads the
 * workspace's inboxes and tenant app URL once, then returns a builder to
 * apply per ref link, so a list page costs two queries, not two per row.
 */
export async function createReflinkLinkBuilder(workspaceId: string) {
  const [{ appUrl }, inboxes] = await Promise.all([
    resolveTenantSettings({ workspaceId }),
    inboxService.listWithIntegrationsByWorkspace(workspaceId),
  ])
  const linkable = inboxes.filter(
    (inbox) => !SKIPPED_CHANNELS.includes(inbox.channel as ChannelType),
  )

  return (name: string): ReflinkChannelLink[] =>
    getInboxLinks(appUrl, linkable, { type: "reflink", name }).map(
      ({ inbox, url }) => ({
        inboxId: inbox.id,
        inboxName: inbox.name,
        channel: inbox.channel as ChannelType,
        url,
        receivesRef: canReceiveRef(inbox.channel as ChannelType),
      }),
    )
}
