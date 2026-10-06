import { inboxService, resolveTenantSettings } from "@chatbotx.io/business"
import {
  canReceiveRef,
  getInboxLinks,
  isLinkableChannel,
} from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"

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
 * workspace's inboxes and tenant settings once, then returns a builder to
 * apply per ref link, so a list page costs two queries, not two per row.
 * The loaded tenant comes back too, so callers that also need branding do
 * not resolve it a second time.
 * Connected inboxes only — the same set the dashboard lists — so a
 * disconnected inbox never leaks a dead link into the API or chat widget.
 */
export async function createReflinkLinkBuilder(workspaceId: string) {
  const [tenant, { data: inboxes }] = await Promise.all([
    resolveTenantSettings({ workspaceId }),
    inboxService.listAllConnectedByWorkspace({
      workspaceId,
      includes: ["integration"],
    }),
  ])
  // The response schema widens enum columns to string; the rows are the
  // same `InboxWithIntegrations` the get-link dialog casts to on the client.
  const linkable = (inboxes as InboxWithIntegrations[]).filter((inbox) =>
    isLinkableChannel(inbox.channel as ChannelType),
  )

  const buildLinks = (name: string): ReflinkChannelLink[] =>
    getInboxLinks(tenant.appUrl, linkable, { type: "reflink", name }).map(
      ({ inbox, url }) => ({
        inboxId: inbox.id,
        inboxName: inbox.name,
        channel: inbox.channel as ChannelType,
        url,
        receivesRef: canReceiveRef(inbox.channel as ChannelType),
      }),
    )

  return { tenant, buildLinks }
}
