import type { ListInboxesResponse, RefConfig } from "@chatbotx.io/business"
import { buildInboxLink, isLinkableChannel } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { useTenantSettings } from "@/features/tenant"
import { useInboxList } from "./inbox-hook"

export type InboxLink = {
  inbox: ListInboxesResponse["data"][number]
  url: string
}

/**
 * Every inbox that has an "open chat" link, paired with that link — the list
 * the Get Link dialog and the ref link chat widget both show.
 */
export function useInboxLinks({
  enabled,
  refConfig,
}: {
  enabled?: boolean
  refConfig?: RefConfig
}): InboxLink[] {
  const inboxes = useInboxList({ enabled })
  const { appUrl } = useTenantSettings()

  return inboxes.flatMap((inbox) => {
    if (!isLinkableChannel(inbox.channel as ChannelType)) {
      return []
    }
    const url = buildInboxLink(
      appUrl,
      inbox as InboxWithIntegrations,
      refConfig,
    )
    return url ? [{ inbox, url }] : []
  })
}
