import "server-only"

import { inboxService, resolveTenantSettings } from "@chatbotx.io/business"
import { buildPollLinks, pollService } from "@chatbotx.io/business/poll"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"

/**
 * Share links for a poll: one omnichannel landing URL plus a deep link for each
 * connected inbox that can start a chat with a ref. Throws not-found when the
 * poll is not in the workspace, so a link is never built for another
 * workspace's poll id.
 */
export async function loadPollLinks(input: {
  workspaceId: string
  pollId: string
}) {
  await pollService.find({ workspaceId: input.workspaceId, id: input.pollId })
  const [{ appUrl }, { data: inboxes }] = await Promise.all([
    resolveTenantSettings({ workspaceId: input.workspaceId }),
    inboxService.listAllConnectedByWorkspace({
      workspaceId: input.workspaceId,
      includes: ["integration"],
    }),
  ])
  const typedInboxes = inboxes as InboxWithIntegrations[]
  return {
    inboxes: typedInboxes,
    links: buildPollLinks({
      appUrl,
      workspaceId: input.workspaceId,
      inboxes: typedInboxes,
      pollId: input.pollId,
    }),
  }
}
