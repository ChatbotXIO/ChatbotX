import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { canReceiveRef, getInboxLinks } from "../inbox/utils"

export type PollLinks = {
  omnichannelUrl: string
  links: { inboxId: string; channel: ChannelType; name: string; url: string }[]
}

export function buildPollLinks(input: {
  appUrl: string
  workspaceId: string
  inboxes: InboxWithIntegrations[]
  pollId: string
}): PollLinks {
  const links = getInboxLinks(input.appUrl, input.inboxes, {
    type: "poll",
    pollId: input.pollId,
  })
    .filter(({ inbox }) => canReceiveRef(inbox.channel as ChannelType))
    .map(({ inbox, url }) => ({
      inboxId: inbox.id,
      channel: inbox.channel as ChannelType,
      name: inbox.name,
      url,
    }))

  return {
    omnichannelUrl: `${input.appUrl}/l/${input.workspaceId}/p/${input.pollId}`,
    links,
  }
}
